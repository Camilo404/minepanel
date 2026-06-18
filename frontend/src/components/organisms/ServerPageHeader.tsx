import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PowerIcon, RefreshCw, Server, FolderOpen, Trash2, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { ServerConnectionInfo } from "@/components/molecules/ServerConnectionInfo";
import { getStatusIcon, getStatusBadgeClass, isTransitioningStatus } from "@/lib/utils/server-status";
import { ServerEdition } from "@/lib/types/types";

export type HeaderAction = "idle" | "starting" | "stopping" | "restarting" | "clearing" | "saving";

interface ServerPageHeaderProps {
  readonly serverId: string;
  readonly serverName: string;
  readonly serverStatus: string;
  readonly serverPort: string;
  readonly serverEdition?: ServerEdition;
  readonly action: HeaderAction;
  readonly onStartServer: () => Promise<boolean>;
  readonly onStopServer: () => Promise<boolean>;
  readonly onRestartServer: () => Promise<boolean>;
  readonly onClearData: () => Promise<boolean>;
  readonly onOpenFiles?: () => void;
}

export function ServerPageHeader({ serverId, serverName, serverStatus, serverPort, serverEdition, action, onStartServer, onStopServer, onRestartServer, onClearData, onOpenFiles }: ServerPageHeaderProps) {
  const { t } = useLanguage();
  const containerName = serverId;
  const [isClearing, setIsClearing] = useState(false);

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      await onClearData();
    } finally {
      setIsClearing(false);
    }
  };

  const isStarting = action === "starting";
  const isStopping = action === "stopping";
  const isRestarting = action === "restarting";
  const isClearingData = action === "clearing";
  const isAnyActionBusy = action !== "idle";

  const getStatusText = (status: string) => {
    switch (status) {
      case "running":
        return t("active");
      case "starting":
        return t("starting2");
      case "stopping":
        return t("stopping2");
      case "restarting":
        return t("restarting");
      case "stopped":
        return t("stopped2");
      case "not_found":
        return t("notFound");
      default:
        return t("unknown");
    }
  };

  // Hide the connection card while we're transitioning the container
  // away from "running". Even with the hook keeping `action` stuck on
  // "stopping" until Docker confirms the exit, a stale poll can still
  // surface "running" during the window — gating on `action` keeps
  // the card hidden until the transition truly settles.
  const showConnectionInfo = serverStatus === "running" && action !== "stopping" && action !== "restarting";

  return (
    <div className="mc-panel p-6 space-y-4 text-gray-200">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/servers">
          <Button variant="outline" size="icon" type="button" className="border-gray-700/50 bg-gray-800/40 text-gray-200 hover:bg-emerald-600/20 hover:text-emerald-400 hover:border-emerald-600/50">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-minecraft">{serverId}</h1>
        <Badge variant="outline" className={`px-3 py-1 ${getStatusBadgeClass(serverStatus)}`}>
          {isTransitioningStatus(serverStatus) ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {getStatusText(serverStatus)}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-current"></div>
              {getStatusText(serverStatus)}
            </span>
          )}
        </Badge>
      </div>

      <div className="mc-slot flex flex-col md:flex-row items-start md:items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="mc-slot shrink-0 w-12 h-12 relative flex items-center justify-center">
            <Image src={getStatusIcon(serverStatus)} alt="Server Status" width={40} height={40} className="pixelated object-contain" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-100 font-minecraft">{serverName || "Minecraft Server"}</p>
            <div className="flex items-center gap-1 mt-1">
              <Server className="h-3 w-3 text-gray-400" />
              <p className="text-xs text-gray-400">{containerName}</p>
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-2 mt-3 md:mt-0">
          {isStarting ? (
            <Button type="button" variant="default" disabled className="gap-2 bg-emerald-600/70 font-minecraft text-white cursor-not-allowed" aria-busy="true">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("starting")}
            </Button>
          ) : isStopping ? (
            <Button type="button" variant="destructive" disabled className="gap-2 bg-red-600/70 font-minecraft text-white cursor-not-allowed" aria-busy="true">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("stopping")}
            </Button>
          ) : serverStatus === "running" || serverStatus === "starting" || serverStatus === "restarting" || serverStatus === "stopping" ? (
            <Button type="button" variant="destructive" onClick={onStopServer} disabled={isAnyActionBusy} className="gap-2 bg-red-600 hover:bg-red-700 font-minecraft text-white">
              <PowerIcon className="h-4 w-4" />
              {t("stopServer")}
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onStartServer} disabled={isAnyActionBusy} className="gap-2 bg-emerald-600 hover:bg-emerald-700 font-minecraft text-white">
              <PowerIcon className="h-4 w-4" />
              {t("startServer")}
            </Button>
          )}

          <Button type="button" variant="outline" onClick={onRestartServer} disabled={isAnyActionBusy || serverStatus !== "running"} className="gap-2 border-gray-700/50 bg-gray-800/40 text-gray-200 hover:bg-orange-600/20 hover:text-orange-400 hover:border-orange-600/50 disabled:opacity-50 disabled:cursor-not-allowed" aria-busy={isRestarting || undefined}>
            {isRestarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isRestarting ? t("restarting") : t("restart2")}
          </Button>

          {onOpenFiles && (
            <Button type="button" variant="outline" onClick={onOpenFiles} disabled={isAnyActionBusy} className="gap-2 border-gray-700/50 bg-gray-800/40 text-gray-200 hover:bg-blue-600/20 hover:text-blue-400 hover:border-blue-600/50 disabled:opacity-50 disabled:cursor-not-allowed">
              <FolderOpen className="h-4 w-4" />
              {t("files")}
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" disabled={isAnyActionBusy || serverStatus === "running" || serverStatus === "starting" || serverStatus === "stopping" || serverStatus === "restarting"} className="gap-2 border-red-700/50 bg-red-900/20 text-red-400 hover:bg-red-600/30 hover:text-red-300 hover:border-red-600/50 disabled:opacity-50 disabled:cursor-not-allowed">
                {isClearingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-gray-900 border-gray-700">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-400 font-minecraft">{t("deleteConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-300">{t("deleteConfirmDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600">{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearData} disabled={isClearing || isClearingData} className="bg-red-700 hover:bg-red-800 text-white border-red-900/50 font-minecraft">
                  {(isClearing || isClearingData) ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("deleting")}
                    </span>
                  ) : (
                    t("yesDeleteAll")
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {showConnectionInfo && (
        <div className="animate-fade-in-up">
          <ServerConnectionInfo port={serverPort} serverId={serverId} edition={serverEdition} />
        </div>
      )}

      <div className="text-xs text-gray-300 px-2">
        <span className="font-medium">{t("tip")}</span> {t("configureServerTip")}
        {showConnectionInfo && ` ${t("changesRequireRestart")}`}
      </div>
    </div>
  );
}
