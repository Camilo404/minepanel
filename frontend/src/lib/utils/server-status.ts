export type ServerStatus = "running" | "stopped" | "starting" | "stopping" | "restarting" | "not_found" | "loading" | "unknown" | "error";

const isTransitioning = (status: string): boolean => status === "starting" || status === "stopping" || status === "restarting";

export const getStatusColor = (status: string): string => {
  switch (status) {
    case "running":
      return "bg-emerald-500";
    case "starting":
    case "restarting":
      return "bg-orange-500";
    case "stopping":
      return "bg-amber-500";
    case "stopped":
      return "bg-yellow-500";
    case "not_found":
      return "bg-red-500";
    case "loading":
      return "bg-blue-500";
    default:
      return "bg-gray-500";
  }
};

export const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case "running":
      return "bg-green-600/20 text-green-400 border-green-600/30";
    case "starting":
    case "restarting":
      return "bg-orange-600/20 text-orange-400 border-orange-600/30";
    case "stopping":
      return "bg-amber-600/20 text-amber-400 border-amber-600/30";
    case "stopped":
      return "bg-yellow-600/20 text-yellow-400 border-yellow-600/30";
    case "not_found":
      return "bg-red-600/20 text-red-400 border-red-600/30";
    case "loading":
      return "bg-blue-600/20 text-blue-400 border-blue-600/30";
    default:
      return "bg-gray-600/20 text-gray-400 border-gray-600/30";
  }
};

// Sidebar uses slightly different badge classes
export const getStatusBadgeClassCompact = (status: string): string => {
  switch (status) {
    case "running":
      return "border-emerald-600/30 text-emerald-400";
    case "stopped":
      return "border-yellow-600/30 text-yellow-400";
    case "starting":
    case "restarting":
      return "border-orange-600/30 text-orange-400";
    case "stopping":
      return "border-amber-600/30 text-amber-400";
    default:
      return "border-red-600/30 text-red-400";
  }
};

export const getStatusIcon = (status: string): string => {
  switch (status) {
    case "running":
      return "/images/emerald.webp";
    case "starting":
    case "restarting":
      return "/images/gold.webp";
    case "stopping":
      return "/images/clock.webp";
    case "stopped":
      return "/images/redstone.webp";
    case "not_found":
      return "/images/barrier.webp";
    case "loading":
      return "/images/lapis.webp";
    default:
      return "/images/barrier.webp";
  }
};

export const isTransitioningStatus = isTransitioning;
