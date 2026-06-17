"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Loader2,
  Trash2,
  Settings as SettingsIcon,
  Zap,
  LayoutTemplate,
  Check,
  Coffee,
  Smartphone,
  Package,
  ExternalLink,
  ArrowRight,
  Search,
  RefreshCw,
  Cpu,
  Activity,
  Hash,
  Layers,
  Box,
  AlertTriangle,
  X,
  Power,
  Server,
} from "lucide-react";
import {
  fetchServerList,
  createServer,
  getAllServersStatus,
  deleteServer,
  getAllServersResources,
  ServerResourceInfo,
  apiRestartServer,
} from "@/services/docker/fetchs";
import { mcToast } from "@/lib/utils/minecraft-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { getStatusBadgeClass, getStatusColor, getStatusIcon } from "@/lib/utils/server-status";
import { useServersStore } from "@/lib/store/servers-store";
import { getTemplatesByEdition, ServerTemplate } from "@/lib/server-templates";
import { ServerEdition, ServerType } from "@/lib/types/types";
import { TranslationKey } from "@/lib/translations";
import { getCurrentUser } from "@/services/users/users.service";
import { cn } from "@/lib/utils";

type ServerStatusKey = "running" | "stopped" | "starting" | "not_found" | "loading";

type ServerInfo = {
  id: string;
  name: string;
  description: string;
  displayName: string;
  status: ServerStatusKey;
  port: string;
  containerName: string;
  edition?: ServerEdition;
  serverType: ServerType;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsage: string;
};

type Filter = "all" | "running" | "stopped" | "starting";

const SERVER_TYPE_META: Record<ServerType, { label: string; icon: string; tone: string }> = {
  VANILLA: { label: "Vanilla", icon: "/images/grass.webp", tone: "text-emerald-300" },
  FORGE: { label: "Forge", icon: "/images/anvil.webp", tone: "text-amber-300" },
  NEOFORGE: { label: "NeoForge", icon: "/images/anvil.webp", tone: "text-orange-300" },
  AUTO_CURSEFORGE: { label: "CurseForge", icon: "/images/enchanted-book.webp", tone: "text-orange-300" },
  MODRINTH: { label: "Modrinth", icon: "/images/enchanted-book.webp", tone: "text-emerald-300" },
  CURSEFORGE: { label: "CurseForge", icon: "/images/enchanted-book.webp", tone: "text-orange-300" },
  GTNH: { label: "GTNH", icon: "/images/enchanted-book.webp", tone: "text-yellow-300" },
  SPIGOT: { label: "Spigot", icon: "/images/diamond-pickaxe.webp", tone: "text-yellow-300" },
  FABRIC: { label: "Fabric", icon: "/images/hopper.webp", tone: "text-cyan-300" },
  MAGMA: { label: "Magma", icon: "/images/lapis.webp", tone: "text-blue-300" },
  PAPER: { label: "Paper", icon: "/images/paper.webp", tone: "text-gray-200" },
  QUILT: { label: "Quilt", icon: "/images/hopper.webp", tone: "text-purple-300" },
  BUKKIT: { label: "Bukkit", icon: "/images/bookshelf.webp", tone: "text-amber-200" },
  PUFFERFISH: { label: "Pufferfish", icon: "/images/diamond.webp", tone: "text-cyan-300" },
  PURPUR: { label: "Purpur", icon: "/images/paper.webp", tone: "text-pink-300" },
  LEAF: { label: "Leaf", icon: "/images/grass.webp", tone: "text-green-300" },
  FOLIA: { label: "Folia", icon: "/images/map.webp", tone: "text-purple-300" },
};

function parsePercentage(value: string): number {
  const match = value.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function parseCpuLimit(limit: string): number {
  const value = parseFloat(limit);
  return isNaN(value) ? 1 : value;
}

function parseMemorySize(str: string): number {
  const match = str.match(/([\d.]+)\s*([KMGT]?i?B?)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    "": 1, B: 1, K: 1024, KB: 1024, KIB: 1024,
    M: 1024 ** 2, MB: 1024 ** 2, MIB: 1024 ** 2,
    G: 1024 ** 3, GB: 1024 ** 3, GIB: 1024 ** 3,
    T: 1024 ** 4, TB: 1024 ** 4, TIB: 1024 ** 4,
  };
  return value * (multipliers[unit] || 1);
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "#f05a5a";
  if (percent >= 70) return "#f5c542";
  return "#34d399";
}

function statusTagClass(status: ServerStatusKey): string {
  switch (status) {
    case "running":
      return "bg-emerald-700/70 text-emerald-200";
    case "starting":
      return "bg-yellow-700/70 text-yellow-200";
    case "stopped":
      return "bg-gray-700/70 text-gray-200";
    case "loading":
      return "bg-blue-700/70 text-blue-200";
    default:
      return "bg-red-800/70 text-red-200";
  }
}

function ServerCardSkeleton() {
  return (
    <div className="mc-panel p-0 overflow-hidden">
      <div className="mc-titlebar px-4 py-3 flex items-center gap-3">
        <Skeleton className="w-12 h-12 bg-gray-700 rounded-none" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3 w-1/2 bg-gray-700 rounded-none" />
          <Skeleton className="h-2 w-1/3 bg-gray-700 rounded-none" />
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 bg-gray-700 rounded-none" />
          <Skeleton className="h-5 w-14 bg-gray-700 rounded-none" />
        </div>
        <Skeleton className="h-10 w-full bg-gray-700 rounded-none" />
        <Skeleton className="h-3 w-2/3 bg-gray-700 rounded-none" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1 bg-gray-700 rounded-none" />
          <Skeleton className="h-9 w-10 bg-gray-700 rounded-none" />
          <Skeleton className="h-9 w-10 bg-gray-700 rounded-none" />
        </div>
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onDelete,
  onRestart,
  onStart,
  isDeleting,
  isRestarting,
}: {
  server: ServerInfo;
  onDelete: (id: string) => void;
  onRestart: (id: string) => void;
  onStart: (id: string) => void;
  isDeleting: boolean;
  isRestarting: boolean;
}) {
  const { t } = useLanguage();
  const isRunning = server.status === "running";
  const isStarting = server.status === "starting";
  const isStopped = server.status === "stopped" || server.status === "not_found";
  const isLoading = server.status === "loading";
  const typeMeta = SERVER_TYPE_META[server.serverType] ?? SERVER_TYPE_META.VANILLA;
  const highUsage = isRunning && (server.cpuPercent >= 80 || server.memoryPercent >= 80);

  return (
    <div
      className={cn(
        "mc-panel p-0 overflow-hidden flex flex-col group",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[inset_3px_3px_0_rgba(255,255,255,0.12),inset_-3px_-3px_0_rgba(0,0,0,0.5),0_10px_0_rgba(0,0,0,0.4),0_22px_40px_rgba(0,0,0,0.55)]"
      )}
    >
      {/* Top status strip */}
      <div
        className={cn(
          "h-1.5 w-full transition-colors",
          isRunning && "bg-emerald-500/90",
          isStarting && "bg-yellow-500/90 animate-pulse",
          isStopped && "bg-gray-500/60",
          isLoading && "bg-blue-500/70 animate-pulse",
          server.status === "not_found" && "bg-red-500/80"
        )}
      />

      {/* Title bar */}
      <div className="mc-titlebar px-4 py-3 flex items-center gap-3">
        <div
          className={cn(
            "mc-slot w-12 h-12 shrink-0 flex items-center justify-center relative",
            isRunning && "mc-slot--active",
            isStarting && "animate-slot-glint"
          )}
        >
          <Image src={getStatusIcon(server.status)} alt="" width={30} height={30} className="pixelated" />
          {highUsage && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 mc-tag bg-amber-600 text-amber-100 flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-3 h-3" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-minecraft text-base text-white truncate group-hover:text-emerald-300 transition-colors">
            {server.displayName}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Hash className="w-3 h-3 text-gray-500 shrink-0" />
            <p className="text-[11px] text-gray-400 font-mono truncate">{server.id}</p>
          </div>
        </div>
        <span
          className={cn(
            "mc-tag text-[10px] px-2 py-0.5 shrink-0 flex items-center gap-1.5",
            statusTagClass(server.status)
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isRunning && "bg-emerald-300 animate-pulse",
              isStarting && "bg-yellow-300 animate-pulse",
              isStopped && "bg-gray-300",
              isLoading && "bg-blue-300 animate-pulse",
              server.status === "not_found" && "bg-red-300"
            )}
          />
          {t(server.status === "loading" ? "loading" : server.status)}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Edition + Type chips (left) and Resources chips (right) */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "mc-tag text-[10px] px-2 py-0.5 flex items-center gap-1.5",
                server.edition === "BEDROCK"
                  ? "bg-purple-700/60 text-purple-200"
                  : "bg-cyan-700/60 text-cyan-200"
              )}
            >
              <Box className="w-3 h-3" />
              {server.edition === "BEDROCK" ? t("bedrockEdition") : t("javaEdition")}
            </span>
            <span
              className={cn(
                "mc-tag text-[10px] px-2 py-0.5 flex items-center gap-1.5 bg-gray-800/70",
                typeMeta.tone
              )}
            >
              <Image src={typeMeta.icon} alt="" width={12} height={12} className="pixelated" />
              {typeMeta.label}
            </span>
          </div>
          {isRunning && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="mc-tag text-[10px] px-2 py-0.5 flex items-center gap-1 font-mono"
                style={{
                  backgroundColor: "rgba(94, 234, 212, 0.12)",
                  color: getUsageColor(server.cpuPercent),
                }}
                title="CPU"
              >
                <Cpu className="w-3 h-3" />
                {server.cpuPercent.toFixed(0)}%
              </span>
              <span
                className="mc-tag text-[10px] px-2 py-0.5 flex items-center gap-1 font-mono"
                style={{
                  backgroundColor: "rgba(52, 211, 153, 0.12)",
                  color: getUsageColor(server.memoryPercent),
                }}
                title="RAM"
              >
                <Activity className="w-3 h-3" />
                {server.memoryPercent.toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* MOTD */}
        <div className="mc-slot px-3 py-2 min-h-[2.5rem] flex items-center">
          <p className="text-[11px] text-gray-300 line-clamp-2 font-minecraft leading-snug">
            {server.description ? server.description : <span className="text-gray-500 italic">{t("noMotd")}</span>}
          </p>
        </div>

        {/* Port */}
        <div className="flex items-center text-[11px] font-mono text-gray-400">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-cyan-400" />
            {t("port")}: <span className="text-gray-200">{server.port || "—"}</span>
          </span>
        </div>

        {/* Action row */}
        <div className="mt-auto pt-3 flex items-center gap-2 border-t-2 border-[var(--mc-frame)]/60">
          <Link href={`/dashboard/servers/${server.id}`} className="flex-1 min-w-0">
            <button className="mc-btn mc-btn-emerald w-full py-2 text-[11px]">
              <SettingsIcon className="w-3.5 h-3.5" />
              {t("configure")}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
          {isRunning && (
            <button
              type="button"
              onClick={() => onRestart(server.id)}
              disabled={isRestarting}
              className="mc-btn mc-btn-gold px-3 py-2 shrink-0"
              title={t("restart2")}
            >
              <RefreshCw className={cn("w-4 h-4", isRestarting && "animate-spin")} />
            </button>
          )}
          {isStopped && !isLoading && (
            <button
              type="button"
              onClick={() => onStart(server.id)}
              disabled={isRestarting}
              className="mc-btn mc-btn-lapis px-3 py-2 shrink-0"
              title={t("startServer")}
            >
              <Power className="w-4 h-4" />
            </button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="mc-btn px-3 py-2 shrink-0"
                style={{ background: "linear-gradient(180deg,#b94a4a,#8f3636)" }}
                title={t("delete")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-minecraft">{t("deleteServerTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  {t("deleteServerWarning")} &quot;{server.id}&quot;?
                  <br />
                  {t("cannotBeUndone")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-gray-700 hover:bg-gray-600">{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(server.id);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("eliminating")}
                    </>
                  ) : (
                    t("delete")
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeletingServer, setIsDeletingServer] = useState<string | null>(null);
  const [restartingServerId, setRestartingServerId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"quick" | "template">("quick");
  const [selectedTemplate, setSelectedTemplate] = useState<ServerTemplate | null>(null);
  const [selectedEdition, setSelectedEdition] = useState<ServerEdition>("JAVA");
  const [canCreateServers, setCanCreateServers] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const availableTemplates = getTemplatesByEdition(selectedEdition);

  const form = useForm<{ id: string }>({
    defaultValues: {
      id: "",
    },
  });

  useEffect(() => {
    let isMounted = true;

    const initializeDashboard = async () => {
      if (isMounted) {
        try {
          const user = await getCurrentUser();
          if (isMounted) {
            setCanCreateServers(user.role === "ADMIN" || user.access.permissions.accessAllServers);
          }
        } catch {
          if (isMounted) {
            setCanCreateServers(false);
          }
        }
        await fetchServersFromBackend();
      }
    };

    initializeDashboard();

    const interval = setInterval(() => {
      if (isMounted) {
        loadServerInfo();
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processServerStatuses = useCallback(
    async (serversList: ServerInfo[]): Promise<ServerInfo[]> => {
      if (serversList.length === 0) return [];

      try {
        const allStatusData: { [key: string]: "running" | "stopped" | "starting" | "not_found" } = await getAllServersStatus();
        const updatedServers = serversList.map((server) => {
          return {
            ...server,
            status: allStatusData[server.id] || "not_found",
          };
        });
        return updatedServers;
      } catch (error) {
        console.error("Error processing server statuses:", error);
        mcToast.error(t("errorProcessingStatuses"));
        return serversList.map((server) => ({ ...server, status: "not_found" as ServerStatusKey }));
      }
    },
    [t]
  );

  const fetchResources = useCallback(
    async (serversList: ServerInfo[]): Promise<ServerInfo[]> => {
      if (serversList.length === 0) return serversList;
      try {
        const res: Record<string, ServerResourceInfo> = await getAllServersResources();
        return serversList.map((server) => {
          const r = res[server.id];
          if (!r) {
            return { ...server, cpuPercent: 0, memoryPercent: 0, memoryUsage: "N/A" };
          }
          const cpuUsage = parsePercentage(r.cpuUsage);
          const cpuLimit = parseCpuLimit(r.cpuLimit);
          const cpuPercent = cpuLimit > 0 ? (cpuUsage / (cpuLimit * 100)) * 100 : 0;
          const memoryUsed = parseMemorySize(r.memoryUsage);
          const memoryLimit = parseMemorySize(r.memoryConfigLimit);
          const memoryPercent = memoryLimit > 0 ? (memoryUsed / memoryLimit) * 100 : 0;
          return {
            ...server,
            cpuPercent,
            memoryPercent,
            memoryUsage: r.memoryUsage,
          };
        });
      } catch (error) {
        console.error("Error fetching server resources:", error);
        return serversList.map((server) => ({ ...server, cpuPercent: 0, memoryPercent: 0, memoryUsage: "N/A" }));
      }
    },
    []
  );

  const fetchServersFromBackend = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setIsLoading(true);
    try {
      const serverList = await fetchServerList();
      const formattedServers: ServerInfo[] = serverList.map((server) => ({
        id: server.id,
        name: server.serverName || `${t("serverDefaultName")} ${server.id}`,
        description: server.motd || t("minecraftServer"),
        displayName: server.serverName || `minecraft-${server.id}`,
        status: "loading",
        port: server.port || "25565",
        containerName: `${server.id}`,
        edition: server.edition,
        serverType: server.serverType,
        cpuPercent: 0,
        memoryPercent: 0,
        memoryUsage: "N/A",
      }));

      setServers(formattedServers);
      const withStatus = await processServerStatuses(formattedServers);
      const withResources = await fetchResources(withStatus);
      setServers(withResources);
    } catch (error) {
      console.error("Error fetching server list:", error);
      mcToast.error(t("errorLoadingServerList"));
    } finally {
      fetchInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [t, processServerStatuses, fetchResources]);

  const refreshGlobalServers = useServersStore((state) => state.refreshAll);

  const serversRef = useRef<ServerInfo[]>([]);
  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  const fetchInFlightRef = useRef(false);

  const handleDeleteServer = async (serverId: string) => {
    setIsDeletingServer(serverId);
    try {
      const response = await deleteServer(serverId);
      if (response.success) {
        mcToast.success(`${t("serverDeletedSuccess")} "${serverId}"`);
        await fetchServersFromBackend();
        refreshGlobalServers();
      } else {
        mcToast.error(`${t("errorDeletingServer")}: ${response.message}`);
      }
    } catch (error) {
      console.error("Error deleting server:", error);
      const err = error as { response?: { data?: { message?: string } } };
      mcToast.error(err.response?.data?.message || t("errorDeletingServer"));
    } finally {
      setIsDeletingServer(null);
    }
  };

  const loadServerInfo = useCallback(async () => {
    const currentServers = serversRef.current;
    if (currentServers.length === 0) return;
    setIsRefreshing(true);
    try {
      const updatedServers = await processServerStatuses(currentServers);
      const withResources = await fetchResources(updatedServers);
      setServers(withResources);
    } catch (error) {
      console.error("Error loading server information:", error);
      mcToast.error(t("errorLoadingServerInfo"));
    } finally {
      setIsRefreshing(false);
    }
  }, [t, processServerStatuses, fetchResources]);

  const handleCreateServer = async (values: { id: string }) => {
    setIsCreatingServer(true);
    try {
      const baseConfig = {
        id: values.id,
        edition: selectedEdition,
        port: selectedEdition === "BEDROCK" ? "19132" : "25565",
        enableRcon: selectedEdition !== "BEDROCK",
        minecraftVersion: selectedEdition === "BEDROCK" ? "LATEST" : "latest",
      };
      const serverData = selectedTemplate ? { ...baseConfig, ...selectedTemplate.config } : baseConfig;
      const response = await createServer(serverData);
      if (response.success) {
        mcToast.success(`${t("serverCreatedSuccess")} "${values.id}"`);
        setIsDialogOpen(false);
        form.reset();
        setSelectedTemplate(null);
        setCreateMode("quick");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await fetchServersFromBackend();
        refreshGlobalServers();
      } else {
        mcToast.error(`${t("errorCreatingServer")}: ${response.message}`);
      }
    } catch (error) {
      console.error("Error creating server:", error);
      const err = error as { response?: { data?: { message?: string } } };
      mcToast.error(err.response?.data?.message || t("errorCreatingServer"));
    } finally {
      setIsCreatingServer(false);
    }
  };

  const handleRestartServer = async (serverId: string) => {
    setRestartingServerId(serverId);
    try {
      const result = await apiRestartServer(serverId);
      if (result.success) {
        mcToast.success(t("serverRestartSuccess"));
      } else {
        mcToast.error(t("serverRestartError"));
      }
    } catch (err) {
      console.error("Error restarting server:", err);
      mcToast.error(t("serverRestartError"));
    } finally {
      setRestartingServerId(null);
      setTimeout(() => loadServerInfo(), 1500);
    }
  };

  const handleStartServer = (serverId: string) => {
    // Start action is handled on the server detail page; navigate the user there.
    window.location.href = `/dashboard/servers/${serverId}`;
  };

  const stats = useMemo(() => {
    const total = servers.length;
    const running = servers.filter((s) => s.status === "running").length;
    const stopped = servers.filter((s) => s.status === "stopped").length;
    const starting = servers.filter((s) => s.status === "starting").length;
    return { total, running, stopped, starting };
  }, [servers]);

  const filteredServers = useMemo(() => {
    return servers.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          s.displayName.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.serverType.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [servers, filter, search]);

  const filterTabs: { value: Filter; label: string; count: number; dot: string }[] = [
    { value: "all", label: t("filterAll"), count: stats.total, dot: "bg-gray-400" },
    { value: "running", label: t("running"), count: stats.running, dot: "bg-emerald-400" },
    { value: "starting", label: t("starting"), count: stats.starting, dot: "bg-yellow-400" },
    { value: "stopped", label: t("stopped"), count: stats.stopped, dot: "bg-gray-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Header panel */}
      <div className="mc-panel animate-fade-in-up">
        <div className="mc-titlebar flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/images/command-block.webp" alt="Dashboard" width={32} height={32} className="pixelated animate-float" />
            <div>
              <h1 className="text-xl sm:text-2xl font-minecraft text-white drop-shadow-glow leading-tight">{t("dashboardTitle")}</h1>
              <p className="text-gray-300 text-xs">{t("dashboardDescription")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadServerInfo()}
              disabled={isLoading || isRefreshing}
              className="mc-btn px-3 py-2.5 self-start"
              title={t("refresh")}
            >
              <RefreshCw className={cn("h-4 w-4", (isLoading || isRefreshing) && "animate-spin")} />
            </button>

            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setSelectedTemplate(null);
                  setCreateMode("quick");
                  setSelectedEdition("JAVA");
                }
              }}
            >
              {canCreateServers ? (
                <DialogTrigger asChild>
                  <button className="mc-btn mc-btn-emerald px-4 py-2.5 self-start">
                    <Plus className="h-4 w-4" />
                    {t("createServer")}
                  </button>
                </DialogTrigger>
              ) : null}
              <DialogContent className="sm:max-w-[560px] bg-gray-900 border-gray-700 text-white max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle className="font-minecraft">{t("createNewServer")}</DialogTitle>
                  <DialogDescription className="text-gray-400">{t("chooseCreationMethod")}</DialogDescription>
                </DialogHeader>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-gray-700 pb-2">
                  <Button
                    type="button"
                    variant={createMode === "quick" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setCreateMode("quick");
                      setSelectedTemplate(null);
                    }}
                    className={createMode === "quick" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700/50"}
                  >
                    <Zap className="h-4 w-4 mr-1" /> {t("quickCreate")}
                  </Button>
                  <Button type="button" variant={createMode === "template" ? "default" : "ghost"} size="sm" onClick={() => setCreateMode("template")} className={createMode === "template" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700/50"}>
                    <LayoutTemplate className="h-4 w-4 mr-1" /> {t("fromTemplate")}
                  </Button>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreateServer)} className="space-y-4 flex-1 overflow-hidden flex flex-col">
                    {createMode === "template" && (
                      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        <p className="text-sm text-gray-400">{t("selectTemplate")}</p>

                        {/* Browse Modpacks callout */}
                        <Link
                          href="/dashboard/templates"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 p-3 rounded-lg border border-purple-700/40 bg-purple-900/15 hover:bg-purple-900/25 hover:border-purple-600/60 transition-all group"
                        >
                          <Package className="h-5 w-5 text-purple-300 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-minecraft text-sm text-purple-200">{t("browseModpacks")}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{t("browseModpacksDesc")}</p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-purple-300 opacity-60 group-hover:opacity-100 shrink-0 mt-0.5" />
                        </Link>

                        {(["vanilla", "paper", "fabric", "forge", "neoforge", "modpack", "specialty"] as const).map((category) => {
                          const groupTemplates = availableTemplates.filter((tpl) => (tpl.category ?? "vanilla") === category);
                          if (groupTemplates.length === 0) return null;
                          const categoryLabel = `templateCategory${category.charAt(0).toUpperCase() + category.slice(1)}` as TranslationKey;
                          return (
                            <div key={category}>
                              <p className="text-[11px] font-minecraft text-gray-400 uppercase tracking-wider mb-1.5">
                                {t(categoryLabel)}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {groupTemplates.map((template) => {
                                  const isSelected = selectedTemplate?.id === template.id;
                                  const isModpack = template.requiresModpack;
                                  return (
                                    <button
                                      key={template.id}
                                      type="button"
                                      onClick={() => setSelectedTemplate(template)}
                                      className={`p-3 rounded-lg border text-left transition-all ${
                                        isSelected
                                          ? isModpack
                                            ? "border-purple-500 bg-purple-900/30"
                                            : "border-emerald-500 bg-emerald-900/30"
                                          : isModpack
                                            ? "border-purple-700/40 bg-gray-800/50 hover:border-purple-500/60"
                                            : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                                      }`}
                                    >
                                      <div className="flex items-start gap-2">
                                        <Image src={`/images/${template.icon}.webp`} alt={template.name} width={24} height={24} className="mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-minecraft text-sm text-white">{t(template.name as TranslationKey)}</span>
                                            {isSelected && <Check className="h-4 w-4 text-emerald-400" />}
                                          </div>
                                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                            {template.id === "modrinth-modpack"
                                              ? t("createServerModrinthModpackDesc")
                                              : template.id === "curseforge-modpack"
                                                ? t("createServerCurseforgeModpackDesc")
                                                : t(template.description as TranslationKey)}
                                          </p>
                                          <div className="flex gap-1 mt-1 flex-wrap">
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-gray-600 text-gray-300 bg-gray-800/50">
                                              {template.config.serverType}
                                            </Badge>
                                            {template.config.gameMode && (
                                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-gray-600 text-gray-300 bg-gray-800/50">
                                                {template.config.gameMode}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* Contextual note for modpack templates */}
                        {selectedTemplate?.requiresModpack && (
                          <div className="bg-amber-900/15 border border-amber-700/40 rounded-lg p-3 text-xs text-amber-200 flex gap-2">
                            <ArrowRight className="h-4 w-4 shrink-0 mt-0.5" />
                            <p>{t("modpackNextStep")}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {createMode === "quick" && <p className="text-sm text-gray-400">{t("quickCreateDesc")}</p>}

                    {/* Edition Selector */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-200">{t("serverEdition")}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEdition("JAVA");
                            setSelectedTemplate(null);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                            selectedEdition === "JAVA"
                              ? "border-emerald-500 bg-emerald-900/30"
                              : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                          }`}
                        >
                          <Coffee className="h-5 w-5 text-orange-400" />
                          <div className="text-left">
                            <span className="text-sm font-minecraft text-white">Java Edition</span>
                            <p className="text-xs text-gray-400">{t("javaEditionDesc")}</p>
                          </div>
                          {selectedEdition === "JAVA" && <Check className="h-4 w-4 text-emerald-400 ml-auto" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEdition("BEDROCK");
                            setSelectedTemplate(null);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                            selectedEdition === "BEDROCK"
                              ? "border-emerald-500 bg-emerald-900/30"
                              : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                          }`}
                        >
                          <Smartphone className="h-5 w-5 text-green-400" />
                          <div className="text-left">
                            <span className="text-sm font-minecraft text-white">Bedrock</span>
                            <p className="text-xs text-gray-400">{t("bedrockEditionDesc")}</p>
                          </div>
                          {selectedEdition === "BEDROCK" && <Check className="h-4 w-4 text-emerald-400 ml-auto" />}
                        </button>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-200">{t("serverIdLabel")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("serverIdPlaceholder")} {...field} className="bg-gray-800 border-gray-700 text-white" />
                          </FormControl>
                          <FormDescription className="text-gray-400">{t("serverIdDescription")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedTemplate && (
                      <div className="p-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
                        <p className="text-sm text-emerald-400 font-minecraft">
                          {t("templateSelected")}: {t(selectedTemplate.name as TranslationKey)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{t(selectedTemplate.description as TranslationKey)}</p>
                      </div>
                    )}

                    <DialogFooter className="gap-3 sm:gap-2 pt-2">
                      <button type="button" onClick={() => setIsDialogOpen(false)} className="mc-btn px-4 py-2.5">
                        {t("cancel")}
                      </button>
                      <button type="submit" disabled={isCreatingServer || (createMode === "template" && !selectedTemplate)} className="mc-btn mc-btn-emerald px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isCreatingServer ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("creating")}
                          </>
                        ) : (
                          t("createServer")
                        )}
                      </button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stat hotbar */}
        {servers.length > 0 && (
          <div className="flex flex-wrap items-stretch gap-3 p-4 border-t-2 border-[var(--mc-frame)]/60">
            {[
              {
                title: t("totalServers"),
                value: stats.total,
                img: "/images/command-block.webp",
                countColor: "text-cyan-300",
                active: false,
              },
              {
                title: t("runningServers"),
                value: stats.running,
                img: "/images/emerald.webp",
                countColor: "text-emerald-300",
                active: stats.running > 0,
              },
              {
                title: t("stoppedServers"),
                value: stats.stopped,
                img: "/images/barrier.webp",
                countColor: "text-gray-300",
                active: false,
              },
              {
                title: t("starting"),
                value: stats.starting,
                img: "/images/gold.webp",
                countColor: "text-yellow-300",
                active: false,
              },
            ].map((slot) => (
              <div key={slot.title} className="flex items-center gap-3">
                <div
                  className={cn(
                    "mc-slot relative w-14 h-14 flex items-center justify-center",
                    slot.active && "mc-slot--active animate-slot-glint"
                  )}
                >
                  <Image src={slot.img} alt={slot.title} width={32} height={32} className="pixelated" />
                  <span className={cn("mc-count absolute bottom-0.5 right-1 text-base", slot.countColor)}>
                    {isLoading ? "…" : slot.value}
                  </span>
                </div>
                <span className="font-minecraft text-[10px] uppercase tracking-wider text-gray-400 max-w-[5.5rem] leading-tight">
                  {slot.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar (search + filter) */}
      {servers.length > 0 && !isLoading && (
        <div className="mc-panel animate-fade-in-up stagger-1">
          <div className="flex flex-col md:flex-row md:items-center gap-3 p-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchServers")}
                className="mc-input w-full pl-9 pr-9 py-2 text-sm font-minecraft"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mc-slot p-1">
              {filterTabs.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-minecraft transition-colors",
                    filter === f.value
                      ? "bg-emerald-600/30 text-emerald-200 shadow-[inset_2px_2px_0_rgba(255,255,255,0.12),inset_-2px_-2px_0_rgba(0,0,0,0.35)]"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", f.dot)} />
                  {f.label}
                  <span className="text-[10px] text-gray-500">({f.count})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Server grid */}
      <div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                <ServerCardSkeleton />
              </div>
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="mc-panel text-center py-16 px-6 animate-fade-in-up">
            <div className="mc-slot w-24 h-24 mx-auto mb-6 flex items-center justify-center animate-float">
              <Image src="/images/chest.webp" alt="Empty chest" width={64} height={64} className="pixelated opacity-80" />
            </div>
            <h3 className="text-2xl font-minecraft text-gray-200 mb-4">{t("noServersAvailable")}</h3>
            <p className="text-gray-400 mb-8 text-lg">{t("noServersAvailableDesc")}</p>
            {canCreateServers && (
              <button onClick={() => setIsDialogOpen(true)} className="mc-btn mc-btn-emerald text-lg px-8 py-3 mx-auto">
                <Plus className="h-5 w-5" />
                {t("createFirstServer")}
              </button>
            )}
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="mc-panel animate-fade-in-up">
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <Image src="/images/map.webp" alt="No results" width={48} height={48} className="pixelated opacity-60 mb-4" />
              <h3 className="text-base font-minecraft text-gray-300 mb-1">{t("noServersFound")}</h3>
              <p className="text-gray-500 text-xs">{t("noServersFoundDesc")}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredServers.map((server, index) => (
              <div key={server.id} className={`animate-fade-in-up stagger-${Math.min(index + 1, 6)}`}>
                <ServerCard
                  server={server}
                  onDelete={handleDeleteServer}
                  onRestart={handleRestartServer}
                  onStart={handleStartServer}
                  isDeleting={isDeletingServer === server.id}
                  isRestarting={restartingServerId === server.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {servers.length > 0 && (
        <div className="flex justify-center gap-8 pt-2">
          <div className="animate-float">
            <Image src="/images/anvil.webp" alt="Anvil" width={32} height={32} className="opacity-50 hover:opacity-80 transition-opacity" />
          </div>
          <div className="animate-float-delay-1">
            <Image src="/images/crafting-table.webp" alt="Crafting Table" width={32} height={32} className="opacity-50 hover:opacity-80 transition-opacity" />
          </div>
          <div className="animate-float-delay-2">
            <Image src="/images/command-block.webp" alt="Command Block" width={32} height={32} className="opacity-50 hover:opacity-80 transition-opacity" />
          </div>
        </div>
      )}
    </div>
  );
}
