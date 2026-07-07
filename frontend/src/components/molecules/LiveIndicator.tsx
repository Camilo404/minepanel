import { FC } from "react";
import { Circle } from "lucide-react";
import type { SseStatus } from "@/lib/sse-client";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/hooks/useLanguage";

interface LiveIndicatorProps {
  status: SseStatus;
  className?: string;
}

export const LiveIndicator: FC<LiveIndicatorProps> = ({ status, className }) => {
  const { t } = useLanguage();
  const visual = visualFor(status, t as (key: string) => string);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-minecraft",
        visual.classes,
        className,
      )}
      role="status"
      aria-live="polite"
      title={visual.title}
    >
      <Circle className={cn("h-2.5 w-2.5 fill-current", status === "open" && "animate-pulse")} />
      {visual.label}
    </span>
  );
};

function visualFor(status: SseStatus, t: (key: string) => string): { label: string; classes: string; title: string } {
  switch (status) {
    case "open":
      return {
        label: t("streamLive"),
        classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
        title: t("streamLive"),
      };
    case "connecting":
      return {
        label: t("streamReconnecting"),
        classes: "border-sky-500/40 bg-sky-500/10 text-sky-300",
        title: t("streamReconnecting"),
      };
    case "reconnecting":
      return {
        label: t("streamReconnecting"),
        classes: "border-amber-500/40 bg-amber-500/10 text-amber-300",
        title: t("streamReconnecting"),
      };
    case "closed":
    default:
      return {
        label: t("streamOffline"),
        classes: "border-gray-600/40 bg-gray-700/30 text-gray-300",
        title: t("streamOffline"),
      };
  }
}