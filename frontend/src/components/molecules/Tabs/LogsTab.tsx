import { useEffect, useRef, useState } from "react";
import { Terminal, RefreshCcw, Cpu, Server, Play, Pause, ChevronDown, Search } from "lucide-react";
import { useServerLogs } from "@/lib/hooks/useServerLogs";
import { getResources } from "@/services/docker/fetchs";
import { useLanguage } from "@/lib/hooks/useLanguage";
import Image from "next/image";
import LogsStatusAlert from "../Logs/LogsStatusAlert";
import { LogsDisplay } from "../Logs/LogsDisplay";
import { QuickCommandConsole } from "../Logs/QuickCommandConsole";
import { cn } from "@/lib/utils";

export interface LogEntry {
  id: string;
  content: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
}

export interface LogsError {
  type: "container_not_found" | "server_not_found" | "connection_error" | "unknown";
  message: string;
}

export interface ResourcesData {
  cpuUsage: string;
  memoryUsage: string;
  memoryLimit: string;
  status?: string;
}

interface LogsTabProps {
  serverId: string;
  rconPort?: string;
  rconPassword?: string;
  serverStatus?: string;
}

export function LogsTab({ serverId, rconPort, rconPassword, serverStatus }: Readonly<LogsTabProps>) {
  const { t } = useLanguage();
  const { logs, filteredLogEntries, loading, lineCount, error, hasErrors, lastUpdate, isRealTime, searchTerm, levelFilter, fetchLogs, setLogLines, clearError, toggleRealTime, setSearchTerm, setLevelFilter } = useServerLogs(serverId);

  const logsContainerRef = useRef<HTMLPreElement>(null!);
  const [resources, setResources] = useState<ResourcesData | null>(null);
  const [loadingResources, setLoadingResources] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const isUserScrollingRef = useRef(false);
  const manualScrollControlRef = useRef(false);

  useEffect(() => {
    fetchLogs();
    fetchServerResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isNearBottom = (container: HTMLElement, threshold = 100) => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < threshold;
  };

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isUserScrollingRef.current && !manualScrollControlRef.current) {
        const nearBottom = isNearBottom(container);
        if (nearBottom !== autoScroll) {
          setAutoScroll(nearBottom);
        }
      }
      isUserScrollingRef.current = true;
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [autoScroll]);

  useEffect(() => {
    if (logsContainerRef.current && logs && autoScroll && !isUserScrollingRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const fetchServerResources = async () => {
    setLoadingResources(true);
    try {
      const resourceData = await getResources(serverId);
      setResources(resourceData);
    } catch (error) {
      console.error("Error fetching server resources:", error);
      setResources({
        cpuUsage: "N/A",
        memoryUsage: "N/A",
        memoryLimit: "N/A",
        status: "error",
      });
    } finally {
      setLoadingResources(false);
    }
  };

  const handleRefreshLogs = async () => {
    clearError();
    await Promise.all([fetchLogs(), fetchServerResources()]);
  };

  const handleAutoScrollToggle = (value: boolean) => {
    manualScrollControlRef.current = true;
    setAutoScroll(value);
    if (value && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
    setTimeout(() => {
      manualScrollControlRef.current = false;
    }, 500);
  };

  const cpuValue = (() => {
    if (loadingResources) return "…";
    if (!resources) return "N/A";
    if (resources.status === "error") return t("error");
    if (resources.status !== "running" && resources.cpuUsage === "N/A") return t("serverInactive");
    return resources.cpuUsage;
  })();
  const memoryValue = (() => {
    if (loadingResources) return "…";
    if (!resources) return "N/A";
    if (resources.status === "error") return t("error");
    if (resources.status !== "running" && resources.memoryUsage === "N/A") return t("serverInactive");
    return `${resources.memoryUsage} / ${resources.memoryLimit}`;
  })();

  const isLive = isRealTime && !error;
  const totalEntries = filteredLogEntries.length;

  return (
    <div className="mc-panel p-0 overflow-hidden animate-fade-in-up">
      {/* Title bar with title + live indicator + compact stats */}
      <div className="mc-titlebar flex flex-wrap items-center gap-2 px-4 py-2.5">
        <Image src="/images/command-block.webp" alt="Logs" width={22} height={22} className="pixelated opacity-90" />
        <h2 className="font-minecraft text-sm text-white drop-shadow-glow">
          {t("serverLogs")}
          <span className="text-gray-400 font-normal text-xs ml-1.5 hidden sm:inline">• {t("viewLogsRealtime")}</span>
        </h2>

        {isLive && (
          <span className="mc-tag text-[10px] px-2 py-0.5 flex items-center gap-1.5 bg-emerald-700/70 text-emerald-200">
            <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
            {t("liveLabel")}
          </span>
        )}

        {/* Compact CPU + RAM stats */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="mc-slot flex items-center gap-2 px-2.5 py-1">
            <div className="mc-slot w-7 h-7 shrink-0 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] text-gray-400 font-minecraft uppercase tracking-wider">CPU</p>
              <p className="text-[11px] font-mono text-cyan-300">{cpuValue}</p>
            </div>
          </div>
          <div className="mc-slot flex items-center gap-2 px-2.5 py-1">
            <div className="mc-slot w-7 h-7 shrink-0 flex items-center justify-center">
              <Server className="w-3.5 h-3.5 text-purple-300" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] text-gray-400 font-minecraft uppercase tracking-wider">RAM</p>
              <p className="text-[11px] font-mono text-purple-300 truncate max-w-[140px]">{memoryValue}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compact alert strip (only when needed) */}
      <LogsStatusAlert hasErrors={hasErrors} error={error} />

      {/* Controls toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b-2 border-[var(--mc-frame)]/60">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("searchInLogs")}
            className="mc-input w-full pl-9 pr-3 py-1.5 text-sm"
          />
        </div>

        <div className="relative">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="appearance-none mc-input pl-3 pr-8 py-1.5 text-sm cursor-pointer"
          >
            <option value="all">{t("allLevels")}</option>
            <option value="error">{t("onlyErrors")}</option>
            <option value="warn">{t("onlyWarnings")}</option>
            <option value="info">{t("onlyInfo")}</option>
            <option value="debug">{t("onlyDebug")}</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1 mc-slot">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-minecraft text-gray-300">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => handleAutoScrollToggle(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 accent-emerald-500"
            />
            {t("autoScroll")}
          </label>
          <div className="w-px h-4 bg-[var(--mc-frame)]" />
          <span className="text-[11px] font-minecraft text-gray-400">{t("lines")}:</span>
          <select
            value={lineCount}
            onChange={(e) => setLogLines(Number(e.target.value))}
            className="bg-transparent text-[11px] font-mono text-gray-200 outline-none cursor-pointer"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
        </div>

        <button
          type="button"
          onClick={toggleRealTime}
          className={cn("mc-btn px-3 py-1.5 text-[11px]", isRealTime ? "mc-btn-emerald" : "mc-btn-gold")}
        >
          {isRealTime ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {isRealTime ? t("pause") : t("resume")}
        </button>
        <button
          type="button"
          onClick={handleRefreshLogs}
          disabled={loading}
          className="mc-btn mc-btn-lapis px-3 py-1.5 text-[11px]"
          title={t("refresh")}
        >
          <RefreshCcw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Logs display */}
      <LogsDisplay
        logsContainerRef={logsContainerRef}
        filteredLogEntries={filteredLogEntries}
        logs={logs}
        loading={loading}
        error={error}
        hasErrors={hasErrors}
        handleRefreshLogs={handleRefreshLogs}
      />

      {/* Quick command console */}
      <QuickCommandConsole
        serverId={serverId}
        rconPort={rconPort || ""}
        rconPassword={rconPassword || ""}
        serverStatus={serverStatus || "stopped"}
      />

      {/* Compact footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t-2 border-[var(--mc-frame)]/60 bg-black/20">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-minecraft text-gray-400">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                error
                  ? "bg-red-500"
                  : hasErrors
                    ? "bg-yellow-500 animate-pulse"
                    : isRealTime
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-gray-500"
              )}
            />
            <span>
              {error
                ? t("disconnected")
                : hasErrors
                  ? t("withErrors")
                  : isRealTime
                    ? t("realTimeActive")
                    : t("realTimePaused")}
            </span>
          </div>
          {lastUpdate && !error && (
            <div className="flex items-center gap-1 text-gray-500">
              <Terminal className="w-3 h-3" />
              <span className="font-mono">{lastUpdate.toLocaleTimeString()}</span>
            </div>
          )}
          <span>
            {t("showing")} {totalEntries} {t("of")} {totalEntries} {t("entries")}
          </span>
        </div>
        <button
          type="button"
          onClick={fetchServerResources}
          disabled={loadingResources}
          className="mc-btn mc-btn-amethyst px-3 py-1.5 text-[11px]"
          title={t("resources")}
        >
          <RefreshCcw className={cn("w-3.5 h-3.5", loadingResources && "animate-spin")} />
          {t("resources")}
        </button>
      </div>

      {/* Inline CSS for log entry styling */}
      <style jsx global>{`
        .minecraft-log {
          line-height: 1.45;
          word-wrap: break-word;
          overflow-wrap: break-word;
          max-width: 100%;
        }
        .log-entry {
          transition: background-color 0.15s ease;
        }
        .log-entry:hover {
          background-color: rgba(255, 255, 255, 0.025);
        }
        .minecraft-log .error,
        .minecraft-log .severe,
        .minecraft-log [level="ERROR"],
        .minecraft-log [level="SEVERE"] {
          color: #ff5555;
          background: rgba(255, 85, 85, 0.1);
          padding: 2px 4px;
          border-radius: 2px;
          font-weight: 600;
        }
        .minecraft-log .warn,
        .minecraft-log .warning,
        .minecraft-log [level="WARN"],
        .minecraft-log [level="WARNING"] {
          color: #ffaa00;
          background: rgba(255, 170, 0, 0.1);
          padding: 2px 4px;
          border-radius: 2px;
          font-weight: 500;
        }
        .minecraft-log .info,
        .minecraft-log [level="INFO"] {
          color: #55ffff;
        }
        .minecraft-log .debug,
        .minecraft-log [level="DEBUG"] {
          color: #aaaaaa;
        }
        .logs-container::-webkit-scrollbar {
          width: 8px;
        }
        .logs-container::-webkit-scrollbar-track {
          background: rgba(17, 24, 39, 0.7);
          border-radius: 4px;
        }
        .logs-container::-webkit-scrollbar-thumb {
          background-color: rgba(55, 65, 81, 0.7);
          border-radius: 4px;
          border: 2px solid rgba(17, 24, 39, 0.7);
        }
        .logs-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(75, 85, 99, 0.8);
        }
      `}</style>
    </div>
  );
}
