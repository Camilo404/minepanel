import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { mcToast } from "@/lib/utils/minecraft-toast";
import { getServerLogsStream } from "@/services/docker/fetchs";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { openSse, type SseHandle, type SseStatus } from "@/lib/sse-client";

interface LogsError {
  type: "container_not_found" | "server_not_found" | "connection_error" | "unknown";
  message: string;
}

interface LogEntry {
  id: string;
  content: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
}

interface LogsResponse {
  logs: string;
  hasErrors: boolean;
  lastUpdate: Date;
  status: "running" | "stopped" | "starting" | "not_found";
  lastTimestamp?: string;
}

type LogsServerStatus = "running" | "stopped" | "starting" | "stopping" | "restarting" | "not_found" | "unknown";

const ERROR_PATTERNS = [/ERROR/gi, /SEVERE/gi, /FATAL/gi, /Exception/gi, /java\.lang\./gi, /Caused by:/gi, /\[STDERR\]/gi, /Failed to/gi, /Cannot/gi, /Unable to/gi];

const detectErrors = (content: string): boolean => {
  if (!content) return false;
  return ERROR_PATTERNS.some((p) => p.test(content));
};

const hashContent = (content: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

interface SseTickPayload {
  type: "tick";
  logs: string;
  hasErrors: boolean;
  status: "running" | "stopped" | "starting" | "not_found";
  lastTimestamp?: string;
  hasNewContent?: boolean;
}

interface SseTerminalPayload {
  type: "terminal";
  status: "stopped" | "not_found";
  logs: string;
  hasErrors: boolean;
  reason: "container_gone" | "server_gone";
}

type SsePayload = SseTickPayload | SseTerminalPayload;

export function useServerLogs(serverId: string, serverStatus: LogsServerStatus = "unknown") {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<string>("");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lineCount, setLineCount] = useState<number>(500);
  const [error, setError] = useState<LogsError | null>(null);
  const [hasErrors, setHasErrors] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isRealTime, setIsRealTime] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [streamStatus, setStreamStatus] = useState<SseStatus>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const lastTimestampRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const lastServerStatusRef = useRef<LogsServerStatus>(serverStatus);
  const sseHandleRef = useRef<SseHandle<SsePayload> | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const activeServerRef = useRef<string | null>(null);
  const isRealTimeRef = useRef<boolean>(true);
  const serverStatusRef = useRef<LogsServerStatus>(serverStatus);

  useEffect(() => {
    isRealTimeRef.current = isRealTime;
  }, [isRealTime]);

  useEffect(() => {
    serverStatusRef.current = serverStatus;
  }, [serverStatus]);

  const parseLogLevel = useCallback((content: string): "info" | "warn" | "error" | "debug" => {
    const upperContent = content.toUpperCase();
    if (upperContent.includes("[ERROR]") || upperContent.includes("ERROR") || upperContent.includes("SEVERE") || upperContent.includes("FATAL")) {
      return "error";
    }
    if (upperContent.includes("[WARN]") || upperContent.includes("WARNING") || upperContent.includes("WARN")) {
      return "warn";
    }
    if (upperContent.includes("[DEBUG]") || upperContent.includes("DEBUG") || upperContent.includes("DEBU")) {
      return "debug";
    }
    return "info";
  }, []);

  const cleanLogContent = useCallback((line: string): string => {
    let cleaned = line.replace(/>\[2K/g, "");
    cleaned = cleaned.replace(/\r/g, "");
    cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, "");
    return cleaned.trim();
  }, []);

  const parseLogsToEntries = useCallback(
    (logsContent: string, existingEntries: LogEntry[] = []): LogEntry[] => {
      if (!logsContent) return [];

      const lines = logsContent.split("\n").filter((line) => line.trim());
      const seen = new Set(existingEntries.map((entry) => entry.content));
      const out: LogEntry[] = [];

      for (const line of lines) {
        const content = cleanLogContent(line);
        if (!content || seen.has(content)) continue;
        seen.add(content);
        out.push({
          id: hashContent(content),
          content,
          timestamp: new Date(0),
          level: parseLogLevel(line),
        });
      }

      return out;
    },
    [parseLogLevel, cleanLogContent]
  );

  const resetBuffer = useCallback(() => {
    setLogEntries([]);
    setHasErrors(false);
    setLogs("");
    lastTimestampRef.current = null;
    isInitialLoadRef.current = true;
  }, []);

  const applyLogsResponse = useCallback(
    (data: LogsResponse, options: { append: boolean }) => {
      if (activeServerRef.current !== serverId) return;
      const content = data.logs ?? "";
      const isContainerGone = content.includes("Container not found") || data.status === "stopped" || data.status === "not_found";
      const isServerGone = content.includes("Server not found");
      const isConnectionError = content.includes("Error retrieving logs:");

      if (isContainerGone) {
        setError({ type: "container_not_found", message: t("serverNotRunning") });
        setLogs(t("serverNotRunning"));
        resetBuffer();
        return;
      }
      if (isServerGone) {
        setError({ type: "server_not_found", message: t("serverNotFound") });
        setLogs(t("serverNotFoundSpecified"));
        resetBuffer();
        return;
      }
      if (isConnectionError) {
        setError({ type: "connection_error", message: t("connectionErrorDocker") });
        setLogs(content);
        setLogEntries([]);
        setHasErrors(false);
        return;
      }

      setError(null);
      setLogs(content);

      if (!options.append || isInitialLoadRef.current || !lastTimestampRef.current) {
        setLogEntries(parseLogsToEntries(content, []));
        isInitialLoadRef.current = false;
      } else {
        setLogEntries((prevEntries) => {
          const newEntries = parseLogsToEntries(content, prevEntries);
          if (newEntries.length === 0) return prevEntries;
          const combined = [...prevEntries, ...newEntries];
          return combined.slice(-2000);
        });
      }

      if (data.lastTimestamp) {
        lastTimestampRef.current = data.lastTimestamp;
      }

      setLastUpdate(new Date());
      setHasErrors(data.hasErrors || detectErrors(content));
    },
    [parseLogsToEntries, resetBuffer, t, serverId]
  );

  const startRealTimeUpdatesRef = useRef<() => void>(() => {});

  useEffect(() => {
    const previous = lastServerStatusRef.current;
    const isGone = serverStatus === "stopped" || serverStatus === "not_found" || serverStatus === "stopping";
    const isAlive = serverStatus === "running" || serverStatus === "starting" || serverStatus === "restarting";
    const wasGone = previous === "stopped" || previous === "not_found";

    if (isGone) {
      setHasErrors(false);
    }
    if (isAlive && wasGone) {
      resetBuffer();
      if (isRealTimeRef.current) {
        startRealTimeUpdatesRef.current();
      }
    }
    lastServerStatusRef.current = serverStatus;
  }, [serverStatus, resetBuffer]);

  const stopStream = useCallback(() => {
    if (sseHandleRef.current) {
      sseHandleRef.current.cancel();
      sseHandleRef.current = null;
    }
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
      sseAbortRef.current = null;
    }
  }, []);

  const startStream = useCallback(() => {
    stopStream();
    setStreamError(null);
    const controller = new AbortController();
    sseAbortRef.current = controller;

    const since = lastTimestampRef.current ?? "";
    const path = since
      ? `/servers/${serverId}/logs/sse?lines=${lineCount}&since=${encodeURIComponent(since)}`
      : `/servers/${serverId}/logs/sse?lines=${lineCount}`;

    sseHandleRef.current = openSse<SsePayload>(path, {
      signal: controller.signal,
      onStatus: setStreamStatus,
      onError: (err) => {
        setStreamError(err.message);
        setError((current) => current ?? { type: "connection_error", message: t("connectionErrorDocker") });
      },
      onMessage: (payload) => {
        if (activeServerRef.current !== serverId) return;
        if (payload.type === "terminal") {
          const fakeResponse: LogsResponse = {
            logs: payload.logs,
            hasErrors: payload.hasErrors,
            lastUpdate: new Date(),
            status: payload.status,
          };
          applyLogsResponse(fakeResponse, { append: false });
          const status = serverStatusRef.current;
          const shouldStop = status === "stopped" || status === "not_found" || status === "stopping";
          if (shouldStop) {
            stopStream();
          }
          return;
        }
        const response: LogsResponse = {
          logs: payload.logs,
          hasErrors: payload.hasErrors,
          lastUpdate: new Date(),
          status: payload.status,
          lastTimestamp: payload.lastTimestamp,
        };
        applyLogsResponse(response, { append: true });
      },
    });
  }, [serverId, lineCount, applyLogsResponse, stopStream, t]);

  const startRealTimeUpdates = useCallback(() => {
    startStream();
  }, [startStream]);

  useEffect(() => {
    startRealTimeUpdatesRef.current = startRealTimeUpdates;
  });

  const stopRealTimeUpdates = useCallback(() => {
    stopStream();
  }, [stopStream]);

  const toggleRealTime = useCallback(() => {
    setIsRealTime((prev) => {
      const newValue = !prev;
      if (newValue) {
        startRealTimeUpdates();
      } else {
        stopRealTimeUpdates();
      }
      return newValue;
    });
  }, [startRealTimeUpdates, stopRealTimeUpdates]);

  const fetchLogs = useCallback(async () => {
    if (activeServerRef.current !== serverId) return "";
    setLoading(true);
    setError(null);
    try {
      const data = await getServerLogsStream(serverId, lineCount);
      if (activeServerRef.current !== serverId) return "";
      applyLogsResponse(data as LogsResponse, { append: false });
      return (data as LogsResponse).logs;
    } catch (err) {
      if (activeServerRef.current !== serverId) return "";
      console.error("Error fetching logs:", err);
      const errorMessage = err instanceof Error ? err.message : t("unknownError");
      setError({ type: "unknown", message: errorMessage });
      setHasErrors(false);
      mcToast.error(t("errorGettingLogsServer"));
      return "";
    } finally {
      if (activeServerRef.current === serverId) {
        setLoading(false);
      }
    }
  }, [serverId, lineCount, applyLogsResponse, t]);

  useEffect(() => {
    activeServerRef.current = serverId;
    setSearchTerm("");
    setLevelFilter("all");
    setLogEntries([]);
    setLogs("");
    setHasErrors(false);
    setError(null);
    setStreamError(null);
    setLastUpdate(null);
    lastTimestampRef.current = null;
    isInitialLoadRef.current = true;

    stopStream();

    void fetchLogs();

    if (isRealTimeRef.current) {
      startRealTimeUpdates();
    }

    return () => {
      activeServerRef.current = null;
      stopRealTimeUpdates();
    };
  }, [serverId, fetchLogs, startRealTimeUpdates, stopRealTimeUpdates, stopStream]);

  useEffect(() => {
    if (isRealTime) {
      startRealTimeUpdates();
    } else {
      stopRealTimeUpdates();
    }
  }, [isRealTime, lineCount, startRealTimeUpdates, stopRealTimeUpdates]);

  const setLogLines = (lines: number) => {
    setLineCount(lines);
  };

  const clearError = () => {
    setError(null);
    setStreamError(null);
  };

  const filteredLogEntries = useMemo(() => {
    return logEntries.filter((entry) => {
      const matchesSearch = searchTerm === "" || entry.content.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel = levelFilter === "all" || entry.level === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [logEntries, searchTerm, levelFilter]);

  return {
    logs,
    logEntries,
    filteredLogEntries,
    loading,
    lineCount,
    error,
    hasErrors,
    lastUpdate,
    isRealTime,
    searchTerm,
    levelFilter,
    fetchLogs,
    setLogLines,
    clearError,
    toggleRealTime,
    setSearchTerm,
    setLevelFilter,
    startRealTimeUpdates,
    stopRealTimeUpdates,
    streamStatus,
    streamError,
  };
}