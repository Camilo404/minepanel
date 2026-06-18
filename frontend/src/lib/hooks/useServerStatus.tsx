import { useState, useEffect, useCallback } from "react";
import { mcToast } from "@/lib/utils/minecraft-toast";
import { getServerStatus as apiGetServerStatus, startServer as apiStartServer, stopServer as apiStopServer } from "@/services/docker/fetchs";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { useServersStore, ServerStatus } from "@/lib/store/servers-store";

export type ServerLifecycleAction = "idle" | "starting" | "stopping";

export function useServerStatus(serverId: string) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<string>("unknown");
  const [action, setAction] = useState<ServerLifecycleAction>("idle");
  const setServerStatus = useServersStore((state) => state.setServerStatus);

  const translateMessage = (message: string): string => {
    const knownKeys = ["serverStarted", "serverStopped", "connectionError", "unexpectedError", "SERVER_START_ERROR", "SERVER_STOP_ERROR"];
    if (knownKeys.includes(message)) {
      return t(message as "serverStarted" | "serverStopped" | "connectionError" | "unexpectedError" | "SERVER_START_ERROR" | "SERVER_STOP_ERROR");
    }
    return message;
  };

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiGetServerStatus(serverId);
      setStatus(data.status);
      setServerStatus(serverId, data.status as ServerStatus); // Sync global store
      return data.status;
    } catch (error) {
      console.error("Error fetching server status:", error);
      setStatus("not_found");
      setServerStatus(serverId, "not_found");
      return "error";
    }
  }, [serverId, setServerStatus]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const applyOptimisticStatus = useCallback(
    (next: ServerStatus) => {
      setStatus(next);
      setServerStatus(serverId, next);
    },
    [serverId, setServerStatus],
  );

  const startServer = async () => {
    setAction("starting");
    applyOptimisticStatus("starting");
    try {
      const result = await apiStartServer(serverId);
      if (result.success) {
        mcToast.success(t("serverStarted"));
        setTimeout(fetchStatus, 3000);
        return true;
      } else {
        throw new Error(translateMessage(result.message || "SERVER_START_ERROR"));
      }
    } catch (error) {
      console.error("Error starting server:", error);
      const errorMessage = error instanceof Error ? translateMessage(error.message) : t("SERVER_START_ERROR");
      mcToast.error(errorMessage);
      fetchStatus();
      return false;
    } finally {
      setAction("idle");
    }
  };

  const stopServer = async () => {
    setAction("stopping");
    applyOptimisticStatus("stopping");
    try {
      const result = await apiStopServer(serverId);
      if (result.success) {
        mcToast.success(t("serverStopped"));
        // Keep action="stopping" until the container actually exits.
        // Previously the action flipped to "idle" the moment the API
        // call returned success, but Docker may still report "running"
        // for several seconds while the container is shutting down —
        // any status poll in that window would briefly flash stale UI
        // (notably the connection info card) before the real
        // "stopped" status arrived.
        const waitForContainerStopped = async () => {
          try {
            const MAX_ATTEMPTS = 20;
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
              await new Promise((r) => setTimeout(r, 1500));
              const current = await fetchStatus();
              if (current === "stopped" || current === "not_found") {
                setAction("idle");
                return;
              }
            }
          } catch (err) {
            console.error("Error while waiting for container to stop:", err);
          }
          // Release the busy state after the timeout so other UI
          // (start button, restart button) doesn't stay disabled
          // forever if the backend never reports "stopped".
          setAction("idle");
        };
        waitForContainerStopped();
        return true;
      } else {
        throw new Error(translateMessage(result.message || "SERVER_STOP_ERROR"));
      }
    } catch (error) {
      console.error("Error stopping server:", error);
      const errorMessage = error instanceof Error ? translateMessage(error.message) : t("SERVER_STOP_ERROR");
      mcToast.error(errorMessage);
      fetchStatus();
      setAction("idle");
      return false;
    }
  };

  return {
    status,
    action,
    fetchStatus,
    setOptimisticStatus: applyOptimisticStatus,
    startServer,
    stopServer,
  };
}
