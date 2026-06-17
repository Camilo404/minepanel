import { CurseForgeModpack } from "../curseforge/curseforge.service";
import { ModrinthModpack } from "../modrinth/modrinth.service";

export type ModpackProvider = "curseforge" | "modrinth";

export type NormalizedModpack =
  | (CurseForgeModpack & { provider: "curseforge" })
  | (ModrinthModpack & { provider: "modrinth" });

export const isCurseforgeModpack = (m: NormalizedModpack): m is CurseForgeModpack & { provider: "curseforge" } =>
  m.provider === "curseforge";

export const isModrinthModpack = (m: NormalizedModpack): m is ModrinthModpack & { provider: "modrinth" } =>
  m.provider === "modrinth";

export const getModpackImageUrl = (m: NormalizedModpack): string | undefined => {
  if (isCurseforgeModpack(m)) return m.logo?.url;
  return m.iconUrl;
};

export const getModpackDownloadCount = (m: NormalizedModpack): number | undefined => {
  if (isCurseforgeModpack(m)) return m.downloadCount;
  return m.downloads;
};

export const getModpackLatestGameVersion = (m: NormalizedModpack): string => {
  if (isCurseforgeModpack(m)) {
    return m.latestFiles?.[0]?.gameVersions?.[0] ?? "N/A";
  }
  return m.latestGameVersions?.[0] ?? "N/A";
};

export const getModpackIsFeatured = (m: NormalizedModpack): boolean => {
  if (isCurseforgeModpack(m)) return Boolean(m.isFeatured);
  return false;
};
