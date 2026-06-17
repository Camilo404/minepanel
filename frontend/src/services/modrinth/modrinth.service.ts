import api from "../axios.service";
import { ModSearchItem, ModSearchResponse } from "../mods/mods-browser.service";

export type ModrinthIndex = "relevance" | "downloads" | "follows" | "newest" | "updated";

export interface ModrinthModpack extends ModSearchItem {
  latestGameVersions?: string[];
  downloadUrl?: string;
  gallery?: string[];
  body?: string;
  dateCreated?: string;
}

export const searchModrinthModpacks = async (params: {
  q?: string;
  limit?: number;
  offset?: number;
  index?: ModrinthIndex;
}): Promise<ModSearchResponse> => {
  const response = await api.get<ModSearchResponse>("/modrinth/modpacks/search", {
    params: {
      q: params.q,
      limit: params.limit,
      offset: params.offset,
      index: params.index ?? "downloads",
    },
  });
  return response.data;
};

export const getModrinthModpack = async (idOrSlug: string): Promise<ModrinthModpack> => {
  const response = await api.get<ModrinthModpack>(
    `/modrinth/modpacks/${encodeURIComponent(idOrSlug)}`,
  );
  return response.data;
};
