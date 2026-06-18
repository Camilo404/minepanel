import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { mcToast } from "@/lib/utils/minecraft-toast";
import { getServerLogsStream } from "@/services/docker/fetchs";
import { useLanguage } from "@/lib/hooks/useLanguage";

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

// Subset of the hook's serverStatus contract: "stopped" / "not_found" mean
// the container is gone, "starting" / "running" / "restarting" mean the
// container is (re)booting. "unknown" is a no-op so the hook stays useful
// for callers that don't know the status yet.
type LogsServerStatus = "running" | "stopped" | "starting" | "stopping" | "restarting" | "not_found" | "unknown";

// Same patterns the backend uses in `analyzeLogs` to flag a buffer as
// containing errors. The frontend re-runs them locally so a missing
// `data.hasErrors` doesn't silently flip the badge.
const ERROR_PATTERNS = [/ERROR/gi, /SEVERE/gi, /FATAL/gi, /Exception/gi, /java\.lang\./gi, /Caused by:/gi, /\[STDERR\]/gi, /Failed to/gi, /Cannot/gi, /Unable to/gi];

const detectErrors = (content: string): boolean => {
  if (!content) return false;
  return ERROR_PATTERNS.some((p) => p.test(content));
};

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousLogsRef = useRef<string>("");
  const lastTimestampRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const lastServerStatusRef = useRef<LogsServerStatus>(serverStatus);

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
    // Solo limpiar caracteres de control innecesarios, mantener códigos ANSI
    let cleaned = line.replace(/>\[2K/g, "");
    cleaned = cleaned.replace(/\r/g, "");

    // Remover timestamp Docker al inicio
    cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, "");

    return cleaned.trim();
  }, []);

  const parseLogsToEntries = useCallback(
    (logsContent: string, existingEntries: LogEntry[] = []): LogEntry[] => {
      if (!logsContent) return [];

      const lines = logsContent.split("\n").filter((line) => line.trim());

      const existingContents = new Set(existingEntries.map((entry) => entry.content));

      return lines
        .filter((line) => !existingContents.has(cleanLogContent(line)))
        .map((line, index) => ({
          id: `${Date.now()}-${index}`,
          content: cleanLogContent(line),
          timestamp: new Date(),
          level: parseLogLevel(line),
        }));
    },
    [parseLogLevel, cleanLogContent]
  );

  // Centralized response handler used by both the manual `fetchLogs` and
  // the real-time poll. Resetting the streaming cursor (`lastTimestampRef`)
  // and clearing the entry buffer when the container is gone is what fixes
  // the "stale error label after stop+start" bug — without it, the old
  // container's `lastTimestamp` would carry over and the freshly booted
  // container's empty early buffer would never update `hasErrors`.
  const applyLogsResponse = useCallback(
    (data: LogsResponse, options: { append: boolean }) => {
      const content = data.logs ?? "";
      const isContainerGone = content.includes("Container not found") || data.status === "stopped" || data.status === "not_found";
      const isServerGone = content.includes("Server not found");
      const isConnectionError = content.includes("Error retrieving logs:");

      if (isContainerGone) {
        setError({ type: "container_not_found", message: t("containerNotFound") });
        setLogs(t("serverNotRunning"));
        setLogEntries([]);
        setHasErrors(false);
        lastTimestampRef.current = null;
        isInitialLoadRef.current = true;
        return;
      }
      if (isServerGone) {
        setError({ type: "server_not_found", message: t("serverNotFound") });
        setLogs(t("serverNotFoundSpecified"));
        setLogEntries([]);
        setHasErrors(false);
        lastTimestampRef.current = null;
        isInitialLoadRef.current = true;
        return;
      }
      if (isConnectionError) {
        setError({ type: "connection_error", message: t("connectionErrorDocker") });
        setLogs(content);
        setLogEntries([]);
        setHasErrors(false);
        return;
      }

      // Success path
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
    [parseLogsToEntries, t]
  );

  // Watch the lifecycle status. When the container disappears or is being
  // recreated, hide the error label immediately (don't wait for the next
  // 3s poll) and reset the streaming cursor so the next successful poll
  // is treated as a fresh load instead of an append into stale data.
  useEffect(() => {
    const previous = lastServerStatusRef.current;
    // "stopping" is a transition: the container is still streaming its
    // shutdown logs ("Stopping the server", "Saving chunks", etc.) so
    // it must NOT be treated as terminal for the buffer-wipe logic.
    // Otherwise a stale "running" poll that lands mid-shutdown would
    // be misread as a restart and wipe the shutdown logs.
    const isGone = serverStatus === "stopped" || serverStatus === "not_found" || serverStatus === "stopping";
    const isAlive = serverStatus === "running" || serverStatus === "starting" || serverStatus === "restarting";
    const wasGone = previous === "stopped" || previous === "not_found";

    if (isGone) {
      setHasErrors(false);
    }
    if (isAlive && wasGone) {
      // Server (re)started after a terminal state: wipe the buffer so
      // old lines from the previous container don't pollute the new
      // session.
      setLogEntries([]);
      setHasErrors(false);
      setLogs("");
      lastTimestampRef.current = null;
      isInitialLoadRef.current = true;
    }
    lastServerStatusRef.current = serverStatus;
  }, [serverStatus]);

  const startRealTimeUpdates = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      if (!isRealTime) return;

      try {
        const since = lastTimestampRef.current || undefined;
        const data = await getServerLogsStream(serverId, lineCount, since);
        applyLogsResponse(data as LogsResponse, { append: true });
      } catch (err) {
        console.error("Real-time log update failed:", err);
      }
    }, 3000);
  }, [serverId, lineCount, isRealTime, applyLogsResponse]);

  const stopRealTimeUpdates = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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
    setLoading(true);
    setError(null);
    try {
      const data = await getServerLogsStream(serverId, lineCount);
      applyLogsResponse(data as LogsResponse, { append: false });
      return (data as LogsResponse).logs;
    } catch (err) {
      console.error("Error fetching logs:", err);
      const errorMessage = err instanceof Error ? err.message : t("unknownError");
      setError({ type: "unknown", message: errorMessage });
      setHasErrors(false);
      mcToast.error(t("errorGettingLogsServer"));
      return "";
    } finally {
      setLoading(false);
    }
  }, [serverId, lineCount, applyLogsResponse, t]);

  useEffect(() => {
    if (isRealTime) {
      startRealTimeUpdates();
    } else {
      stopRealTimeUpdates();
    }

    return () => {
      stopRealTimeUpdates();
    };
  }, [isRealTime, startRealTimeUpdates, stopRealTimeUpdates]);

  useEffect(() => {
    // Reset the entire streaming state when the user navigates between
    // servers. Next.js usually remounts the page, but defending against
    // client-side reuse of the hook avoids leaking the previous server's
    // entries, error label, and timestamp cursor into the new view.
    setSearchTerm("");
    setLevelFilter("all");
    setLogEntries([]);
    setLogs("");
    setHasErrors(false);
    setError(null);
    setLastUpdate(null);
    lastTimestampRef.current = null;
    isInitialLoadRef.current = true;
    previousLogsRef.current = "";
  }, [serverId]);

  const setLogLines = (lines: number) => {
    setLineCount(lines);
  };

  const clearError = () => {
    setError(null);
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
  };
}
