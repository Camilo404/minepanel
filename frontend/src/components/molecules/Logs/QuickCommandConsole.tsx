import { FC, useRef, KeyboardEvent } from "react";
import { Send, AlertTriangle, Trash } from "lucide-react";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { useServerCommands } from "@/lib/hooks/useServerCommands";
import Image from "next/image";

interface QuickCommandConsoleProps {
  serverId: string;
  rconPort: string;
  rconPassword: string;
  serverStatus: string;
}

export const QuickCommandConsole: FC<QuickCommandConsoleProps> = ({ serverId, rconPort, rconPassword, serverStatus }) => {
  const { t } = useLanguage();
  const { command, response, executing, executeCommand, setCommand, clearResponse } = useServerCommands(serverId, rconPort, rconPassword);
  const inputRef = useRef<HTMLInputElement>(null);

  const isServerRunning = serverStatus === "running";
  const hasRconConfigured = Boolean(rconPort);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  return (
    <div className="px-4 pb-3 space-y-2.5">
      {/* Inline warnings (only when needed) */}
      {!hasRconConfigured && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 mc-slot" style={{ borderColor: "var(--mc-redstone)" }}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-300" />
          <div className="text-[11px] text-red-200">
            <span className="font-minecraft">{t("rconPortNotConfigured")}</span>
            <span className="text-red-300/70"> — {t("rconPortNotConfiguredDesc")}</span>
          </div>
        </div>
      )}

      {hasRconConfigured && !isServerRunning && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 mc-slot" style={{ borderColor: "var(--mc-gold)" }}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-300" />
          <div className="text-[11px] text-yellow-200">
            <span className="font-minecraft">{t("serverNotRunning2")}</span>
            <span className="text-yellow-300/70"> — {t("startServerToExecute")}</span>
          </div>
        </div>
      )}

      {/* Title + input row */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-gray-300 font-minecraft text-[11px]">
          <Image src="/images/command-block.webp" alt="Commands" width={14} height={14} className="opacity-90" />
          {t("quickCommandConsole")}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("enterMinecraftCommand")}
            disabled={!hasRconConfigured || !isServerRunning || executing}
            className="mc-input flex-1 px-3 py-1.5 text-sm font-mono disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => executeCommand()}
            disabled={!hasRconConfigured || !isServerRunning || !command.trim() || executing}
            className="mc-btn mc-btn-emerald px-3 py-1.5 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className={cn(executing ? "animate-pulse" : "", "w-3.5 h-3.5")} />
            {executing ? t("sending") : t("send")}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 pl-1">{t("pressTabToAutocomplete")}</p>
      </div>

      {/* Response */}
      {response && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-gray-300 font-minecraft text-[11px]">
            <div className="flex items-center gap-2">
              <Image src="/images/redstone.webp" alt="Response" width={14} height={14} className="opacity-90" />
              {t("serverResponse")}
            </div>
            <button
              type="button"
              onClick={clearResponse}
              className="text-gray-400 hover:text-white p-1"
              title={t("delete")}
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          </div>
          <pre className="mc-slot px-3 py-2 text-emerald-300 text-[11px] font-mono whitespace-pre-wrap max-h-[180px] overflow-auto">
            {response}
          </pre>
        </div>
      )}
    </div>
  );
};

// Local cn helper to avoid circular import issues
function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
