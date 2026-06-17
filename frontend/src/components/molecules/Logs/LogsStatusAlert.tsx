import { FC, memo } from "react";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { AlertTriangle } from "lucide-react";
import { LogsError } from "../Tabs/LogsTab";

interface LogsStatusAlertProps {
  hasErrors: boolean;
  error: LogsError | null;
}

const LogsStatusAlert: FC<LogsStatusAlertProps> = ({ hasErrors, error }) => {
  const { t } = useLanguage();
  if (!hasErrors || error) return null;
  return (
    <div className="mx-4 mt-2.5 flex items-center gap-2 px-3 py-1.5 mc-slot" style={{ borderColor: "var(--mc-gold)" }}>
      <AlertTriangle className="h-3.5 w-3.5 text-yellow-300 shrink-0" />
      <span className="text-[11px] font-minecraft text-yellow-200 truncate">
        {t("errorsDetected")} <span className="text-yellow-300/80">— {t("errorsDetectedDesc")}</span>
      </span>
    </div>
  );
};

export default memo(LogsStatusAlert);
