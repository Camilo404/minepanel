import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openSse, type SseHandle, type SseStatus } from "@/lib/sse-client";
import { getServerMetrics, type MetricHistory, type MetricPoint } from "@/services/metrics/metrics.service";

const MAX_LIVE_POINTS = 360;

export interface LiveMetricPoint {
  cpuPercent: number | null;
  memoryMb: number | null;
  memoryLimitMb: number | null;
  status: "running" | "stopped" | "starting" | "not_found";
  timestamp: string;
}

interface SseTickPayload {
  type: "tick";
  cpuPercent: number | null;
  memoryMb: number | null;
  memoryLimitMb: number | null;
  status: "running" | "stopped" | "starting" | "not_found";
  timestamp: string;
}

type SsePayload = SseTickPayload;

export interface UseServerMetricsStreamOptions {
  hours: number;
  enabled?: boolean;
}

export interface UseServerMetricsStreamResult {
  history: MetricHistory | null;
  livePoints: LiveMetricPoint[];
  combinedPoints: MetricPoint[];
  loading: boolean;
  error: string | null;
  status: SseStatus;
  refresh: () => Promise<void>;
}

export function useServerMetricsStream(serverId: string, options: UseServerMetricsStreamOptions): UseServerMetricsStreamResult {
  const { hours, enabled = true } = options;
  const [history, setHistory] = useState<MetricHistory | null>(null);
  const [livePoints, setLivePoints] = useState<LiveMetricPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SseStatus>("connecting");
  const handleRef = useRef<SseHandle<SsePayload> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeServerRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getServerMetrics(serverId, hours);
      if (activeServerRef.current !== serverId) return;
      setHistory(data);
      setLivePoints([]);
    } catch (err) {
      if (activeServerRef.current !== serverId) return;
      console.error("Error fetching metrics history:", err);
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      if (activeServerRef.current === serverId) {
        setLoading(false);
      }
    }
  }, [serverId, hours]);

  useEffect(() => {
    if (!enabled) return;

    activeServerRef.current = serverId;
    let cancelled = false;

    void refresh();

    const controller = new AbortController();
    abortRef.current = controller;

    handleRef.current = openSse<SsePayload>(`/metrics/${serverId}/stream`, {
      signal: controller.signal,
      onStatus: setStatus,
      onError: (err) => {
        if (cancelled || activeServerRef.current !== serverId) return;
        setError(err.message);
      },
      onMessage: (payload) => {
        if (cancelled || activeServerRef.current !== serverId) return;
        if (payload.type !== "tick") return;
        const point: LiveMetricPoint = {
          cpuPercent: payload.cpuPercent,
          memoryMb: payload.memoryMb,
          memoryLimitMb: payload.memoryLimitMb,
          status: payload.status,
          timestamp: payload.timestamp,
        };
        setLivePoints((prev) => [...prev, point].slice(-MAX_LIVE_POINTS));
      },
    });

    return () => {
      cancelled = true;
      activeServerRef.current = null;
      handleRef.current?.cancel();
      handleRef.current = null;
      controller.abort();
      abortRef.current = null;
    };
  }, [serverId, hours, enabled, refresh]);

  const combinedPoints = useMemo<MetricPoint[]>(() => {
    const historical = history?.points ?? [];
    const live: MetricPoint[] = [];
    for (const point of livePoints) {
      if (point.cpuPercent === null || point.memoryMb === null) continue;
      live.push({
        cpuPercent: point.cpuPercent,
        memoryMb: point.memoryMb,
        memoryLimitMb: point.memoryLimitMb,
        timestamp: point.timestamp,
      });
    }
    return [...historical, ...live];
  }, [history, livePoints]);

  return {
    history,
    livePoints,
    combinedPoints,
    loading,
    error,
    status,
    refresh,
  };
}