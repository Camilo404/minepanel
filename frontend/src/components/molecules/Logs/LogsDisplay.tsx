import { LogEntry, LogsError } from "../Tabs/LogsTab";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { Terminal, RefreshCcw, XCircle } from "lucide-react";
import Image from "next/image";
import { FC } from "react";
import { AnsiText } from "@/lib/utils/ansiParser";
import { cn } from "@/lib/utils";

interface LogsDisplayProps {
  logsContainerRef: React.RefObject<HTMLPreElement>;
  filteredLogEntries: LogEntry[];
  logs: string;
  loading: boolean;
  error: LogsError | null;
  hasErrors: boolean;
  handleRefreshLogs: () => void | Promise<void>;
}

const levelStyles: Record<LogEntry["level"], string> = {
  info: "bg-blue-600/30 text-blue-200 border-blue-500/40",
  warn: "bg-yellow-600/30 text-yellow-200 border-yellow-500/40",
  error: "bg-red-600/30 text-red-200 border-red-500/40",
  debug: "bg-gray-700/50 text-gray-300 border-gray-600/40",
};

const levelDot: Record<LogEntry["level"], string> = {
  info: "bg-cyan-300",
  warn: "bg-yellow-300",
  error: "bg-red-300",
  debug: "bg-gray-400",
};

export const LogsDisplay: FC<LogsDisplayProps> = ({ logsContainerRef, filteredLogEntries, logs, loading, error, hasErrors, handleRefreshLogs }) => {
  const { t } = useLanguage();

  const statusLabel = error ? t("error") : hasErrors ? t("withErrors") : t("console");
  const statusColor = error
    ? "bg-red-800/80 text-red-300 border-red-700"
    : hasErrors
      ? "bg-yellow-800/80 text-yellow-200 border-yellow-700"
      : "bg-emerald-800/70 text-emerald-200 border-emerald-700";

  return (
    <div className="mx-4 mb-3">
      <div className="relative border-2 border-[var(--mc-frame)] shadow-[inset_3px_3px_0_rgba(0,0,0,0.55)] overflow-hidden">
        {/* Compact status bar */}
        <div className={cn("flex items-center justify-between px-3 py-1 border-b-2 border-[var(--mc-frame)] bg-black/40", statusColor)}>
          <div className="flex items-center gap-1.5 text-[11px] font-minecraft">
            <Terminal className="h-3 w-3" />
            <span>{statusLabel}</span>
          </div>
          <span className="text-[10px] font-mono opacity-80">
            {filteredLogEntries.length > 0 ? `${filteredLogEntries.length} ${t("entries")}` : ""}
          </span>
        </div>

        <pre
          ref={logsContainerRef}
          className={cn(
            "logs-container px-3 py-2.5 overflow-x-hidden overflow-y-auto text-[11px] font-mono scrollbar-thin h-[480px] max-w-full break-words [overflow-wrap:anywhere] whitespace-pre-wrap",
            error ? "bg-red-950/40 text-red-300" : hasErrors ? "bg-yellow-950/15 text-emerald-300" : "bg-gray-950/85 text-emerald-300"
          )}
        >
          {filteredLogEntries.length > 0 ? (
            <div className="minecraft-log space-y-0.5">
              {filteredLogEntries.map((entry) => (
                <div key={entry.id} className="log-entry flex items-start gap-2 px-1.5 py-0.5 rounded hover:bg-white/[0.025]">
                  <span className={cn("shrink-0 mt-1 w-1.5 h-1.5 rounded-full", levelDot[entry.level])} aria-hidden />
                  <span className={cn("shrink-0 text-[9px] font-minecraft uppercase tracking-wider px-1.5 py-0.5 border", levelStyles[entry.level])}>
                    {entry.level}
                  </span>
                  <span className="flex-1 min-w-0 break-words">
                    <AnsiText text={entry.content} />
                  </span>
                </div>
              ))}
            </div>
          ) : logs ? (
            <div className="minecraft-log">
              <AnsiText text={logs} />
            </div>
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <RefreshCcw className="h-5 w-5 animate-spin" />
              <span className="font-minecraft text-xs">{t("loadingLogs")}</span>
              <Image src="/images/loading-cube.webp" alt="Loading" width={28} height={28} className="animate-pulse" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-red-300">
              <XCircle className="h-12 w-12 opacity-70" />
              <div className="text-center">
                <span className="font-minecraft text-sm block mb-1">{t("errorLoadingLogs")}</span>
                <span className="text-[10px] text-red-300/80">{error.message}</span>
              </div>
              <button onClick={handleRefreshLogs} className="mc-btn mc-btn-gold px-3 py-1.5 text-[11px]">
                <RefreshCcw className="w-3.5 h-3.5" />
                {t("retry")}
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
              <Image src="/images/empty-chest.png" alt="No Logs" width={48} height={48} className="opacity-70" />
              <span className="font-minecraft text-xs">{t("noLogsAvailable")}</span>
            </div>
          )}
        </pre>
      </div>
    </div>
  );
};
