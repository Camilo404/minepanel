"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Loader2, Package, AlertCircle, TrendingUp, Star } from "lucide-react";
import { useLanguage } from "@/lib/hooks/useLanguage";
import ModpackCard from "@/components/molecules/modpacks/ModpackCard";
import { ModpackSearch } from "@/components/organisms/ModpackSearch";
import { ModpackDetailsModalEnhanced } from "@/components/molecules/modpacks/ModpackDetailsModalEnhanced";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurseForgeModpack, searchModpacks, getFeaturedModpacks, getPopularModpacks } from "@/services/curseforge/curseforge.service";
import { searchModrinthModpacks, getModrinthModpack, type ModrinthModpack, type ModrinthIndex } from "@/services/modrinth/modrinth.service";
import { NormalizedModpack, isModrinthModpack } from "@/services/modpacks/modpacks.types";
import { mcToast } from "@/lib/utils/minecraft-toast";

type Provider = "curseforge" | "modrinth";

const MODPACK_INDEX_MAP: Record<number, ModrinthIndex> = {
  1: "follows",
  2: "downloads",
  3: "updated",
  4: "relevance",
  6: "downloads",
};

const DEFAULT_MODRITH_INDEX: ModrinthIndex = "downloads";

export default function TemplatesPage() {
  const { t } = useLanguage();
  const [provider, setProvider] = useState<Provider>("curseforge");
  const [items, setItems] = useState<NormalizedModpack[]>([]);
  const [featuredItems, setFeaturedItems] = useState<NormalizedModpack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedModpack, setSelectedModpack] = useState<NormalizedModpack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("popular");
  const [pagination, setPagination] = useState({
    index: 0,
    pageSize: 20,
    totalCount: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSort, setSearchSort] = useState({ field: 2, order: "desc" as "asc" | "desc" });

  const observerTarget = useRef<HTMLDivElement>(null);

  const stampProvider = useCallback(
    (modpack: CurseForgeModpack | ModrinthModpack): NormalizedModpack =>
      ({ ...modpack, provider } as NormalizedModpack),
    [provider],
  );

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (provider === "curseforge") {
        const [popularResponse, featuredResponse] = await Promise.all([getPopularModpacks(18), getFeaturedModpacks(12)]);
        setItems(popularResponse.data.map(stampProvider));
        setFeaturedItems(featuredResponse.data.map(stampProvider));
        setPagination({
          index: popularResponse.pagination.index,
          pageSize: popularResponse.pagination.pageSize,
          totalCount: popularResponse.pagination.totalCount,
        });
      } else {
        const popularResponse = await searchModrinthModpacks({ limit: 18, index: DEFAULT_MODRITH_INDEX });
        setItems(popularResponse.data.map((m) => stampProvider(m as ModrinthModpack)));
        setFeaturedItems(popularResponse.data.slice(0, 12).map((m) => stampProvider(m as ModrinthModpack)));
        setPagination({
          index: popularResponse.pagination.index,
          pageSize: popularResponse.pagination.pageSize,
          totalCount: popularResponse.pagination.totalCount,
        });
      }
    } catch (err) {
      console.error("Error loading modpacks:", err);
      const backendMessage =
        (err as any)?.response?.data?.message ?? (err instanceof Error ? err.message : "Unknown error");

      if (provider === "curseforge" && (backendMessage.includes("API key") || backendMessage.includes("403"))) {
        setError(t("curseforgeApiKeyNotConfigured"));
      } else {
        setError(t("errorLoadingModpacks"));
      }
      mcToast.error(t("errorLoadingModpacks"));
    } finally {
      setIsLoading(false);
    }
  }, [provider, t, stampProvider]);

  useEffect(() => {
    setItems([]);
    setFeaturedItems([]);
    setPagination({ index: 0, pageSize: 20, totalCount: 0 });
    setSelectedModpack(null);
    setActiveTab("popular");
    setSearchQuery("");
    loadInitialData();
  }, [loadInitialData]);

  const handleSearch = async (query: string, sortField: number, sortOrder: "asc" | "desc") => {
    setIsSearching(true);
    setError(null);
    setSearchQuery(query);
    setSearchSort({ field: sortField, order: sortOrder });

    try {
      if (provider === "curseforge") {
        const response = await searchModpacks(query, 18, 0, sortField, sortOrder);
        setItems(response.data.map(stampProvider));
        setPagination({
          index: response.pagination.index,
          pageSize: response.pagination.pageSize,
          totalCount: response.pagination.totalCount,
        });
      } else {
        const mrIndex: ModrinthIndex = MODPACK_INDEX_MAP[sortField] ?? (query ? "relevance" : DEFAULT_MODRITH_INDEX);
        const response = await searchModrinthModpacks({ q: query, limit: 18, offset: 0, index: mrIndex });
        setItems(response.data.map((m) => stampProvider(m as ModrinthModpack)));
        setPagination({
          index: response.pagination.index,
          pageSize: response.pagination.pageSize,
          totalCount: response.pagination.totalCount,
        });
      }
      setActiveTab("search");
    } catch (err) {
      console.error("Error searching modpacks:", err);
      mcToast.error(t("errorSearchingModpacks"));
    } finally {
      setIsSearching(false);
    }
  };

  const loadMoreModpacks = useCallback(async () => {
    if (isLoadingMore || items.length >= pagination.totalCount) return;

    setIsLoadingMore(true);
    try {
      const nextIndex = pagination.index + pagination.pageSize;
      let response: { data: (CurseForgeModpack | ModrinthModpack)[]; pagination: { index: number; pageSize: number; resultCount: number; totalCount: number } };

      if (provider === "curseforge") {
        if (activeTab === "search" && searchQuery) {
          response = await searchModpacks(searchQuery, 18, nextIndex, searchSort.field, searchSort.order);
        } else {
          response = await searchModpacks("", 18, nextIndex, 2, "desc");
        }
        setItems((prev) => [...prev, ...(response.data as CurseForgeModpack[]).map(stampProvider)]);
      } else {
        if (activeTab === "search" && searchQuery) {
          const mrIndex: ModrinthIndex = MODPACK_INDEX_MAP[searchSort.field] ?? "relevance";
          response = await searchModrinthModpacks({ q: searchQuery, limit: 18, offset: nextIndex, index: mrIndex });
        } else {
          response = await searchModrinthModpacks({ limit: 18, offset: nextIndex, index: DEFAULT_MODRITH_INDEX });
        }
        setItems((prev) => [...prev, ...(response.data as ModrinthModpack[]).map((m) => stampProvider(m))]);
      }

      setPagination({
        index: response.pagination.index,
        pageSize: response.pagination.pageSize,
        totalCount: response.pagination.totalCount,
      });
    } catch (err) {
      console.error("Error loading more modpacks:", err);
      mcToast.error(t("errorLoadingModpacks"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, items.length, pagination, activeTab, searchQuery, searchSort, provider, t, stampProvider]);

  const handleSelectModpack = useCallback(
    async (modpack: NormalizedModpack) => {
      if (isModrinthModpack(modpack)) {
        try {
          const detail = await getModrinthModpack(modpack.slug);
          setSelectedModpack({ ...detail, provider: "modrinth" });
        } catch (err) {
          console.warn("Failed to fetch Modrinth modpack detail, falling back to list data:", err);
          setSelectedModpack(modpack);
        }
      } else {
        setSelectedModpack(modpack);
      }
    },
    [],
  );

  const observerStateRef = useRef({ loadMoreModpacks, isLoadingMore, isSearching });
  observerStateRef.current = { loadMoreModpacks, isLoadingMore, isSearching };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        const { isLoadingMore, isSearching, loadMoreModpacks } = observerStateRef.current;
        if (!isLoadingMore && !isSearching) {
          loadMoreModpacks();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Image src="/images/loading-cube.webp" alt="" width={64} height={64} className="pixelated animate-spin-slow" />
        <p className="text-gray-300 font-minecraft">{t("loadingModpacks")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Recipe book header */}
      <div className="mc-panel animate-fade-in-up">
        <div className="mc-titlebar flex items-center gap-3 px-4 py-3">
          <Image src="/images/bookshelf.webp" alt="Templates" width={32} height={32} className="pixelated animate-float" />
          <div>
            <h1 className="text-xl sm:text-2xl font-minecraft text-white drop-shadow-glow leading-tight">{t("modpackTemplates")}</h1>
            <p className="text-gray-300 text-xs">{t("modpackTemplatesDescription")}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="animate-fade-in">
          <div className="mc-slot flex items-start gap-3 p-4" style={{ borderColor: "#f05a5a" }}>
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-minecraft text-red-300 mb-1">{t("error")}</p>
              <p className="text-gray-300">{error}</p>
              {error === t("curseforgeApiKeyNotConfigured") && (
                <a href="/dashboard/settings" className="block mt-2 text-emerald-400 hover:underline font-minecraft">
                  {t("goToSettings")}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {!error && (
        <>
          <div className="animate-fade-in-up stagger-1 flex flex-wrap items-center gap-3">
            <div className="mc-panel flex items-center gap-1 p-1">
              <button
                type="button"
                onClick={() => setProvider("curseforge")}
                className={`mc-btn px-4 py-1.5 text-xs ${provider === "curseforge" ? "mc-btn-emerald" : ""}`}
                aria-pressed={provider === "curseforge"}
              >
                {t("providerCurseforge")}
              </button>
              <button
                type="button"
                onClick={() => setProvider("modrinth")}
                className={`mc-btn px-4 py-1.5 text-xs ${provider === "modrinth" ? "mc-btn-emerald" : ""}`}
                aria-pressed={provider === "modrinth"}
              >
                {t("providerModrinth")}
              </button>
            </div>
          </div>

          <div className="animate-fade-in-up stagger-1">
            <ModpackSearch onSearch={handleSearch} isLoading={isSearching} />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-auto">
              <TabsTrigger value="featured">
                <Star className="w-4 h-4 mr-2" />
                {t("featured")}
              </TabsTrigger>
              <TabsTrigger value="popular">
                <TrendingUp className="w-4 h-4 mr-2" />
                {t("popular")}
              </TabsTrigger>
              <TabsTrigger value="search">
                <Package className="w-4 h-4 mr-2" />
                {t("searchResults")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="featured" className="mt-6">
              {featuredItems.length === 0 ? (
                <div className="text-center py-12">
                  <Image src="/images/barrier.webp" alt="No results" width={64} height={64} className="mx-auto opacity-50 mb-4" />
                  <p className="text-gray-400">{t("noModpacksFound")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                  {featuredItems.map((modpack) => (
                    <ModpackCard key={getKey(modpack)} modpack={modpack} onSelect={handleSelectModpack} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="popular" className="mt-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                  {items.map((modpack) => (
                    <ModpackCard key={getKey(modpack)} modpack={modpack} onSelect={handleSelectModpack} />
                  ))}
                </div>

                {items.length < pagination.totalCount && (
                  <div ref={observerTarget} className="flex justify-center py-8">
                    {isLoadingMore && (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="font-minecraft">{t("loading")}</span>
                      </div>
                    )}
                  </div>
                )}

                {items.length >= pagination.totalCount && items.length > 0 && (
                  <div className="text-center py-4 text-gray-500 font-minecraft">
                    {t("showing")} {items.length} {t("of")} {pagination.totalCount} modpacks
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="search" className="mt-6">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <Image src="/images/barrier.webp" alt="No results" width={64} height={64} className="mx-auto opacity-50 mb-4" />
                  <p className="text-gray-400">{t("noModpacksFound")}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                    {items.map((modpack) => (
                      <ModpackCard key={getKey(modpack)} modpack={modpack} onSelect={handleSelectModpack} />
                    ))}
                  </div>

                  {items.length < pagination.totalCount && (
                    <div ref={observerTarget} className="flex justify-center py-8">
                      {isLoadingMore && (
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span className="font-minecraft">{t("loading")}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {items.length >= pagination.totalCount && items.length > 0 && (
                    <div className="text-center py-4 text-gray-500 font-minecraft">
                      {t("showing")} {items.length} {t("of")} {pagination.totalCount} modpacks
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <ModpackDetailsModalEnhanced modpack={selectedModpack} open={!!selectedModpack} onClose={() => setSelectedModpack(null)} />

      <div className="flex justify-center gap-8 pt-8">
        <div className="animate-float">
          <Image src="/images/diamond.webp" alt="Diamond" width={32} height={32} className="opacity-50 hover:opacity-80 transition-opacity" />
        </div>
        <div className="animate-float-delay-1">
          <Image src="/images/bookshelf.webp" alt="Bookshelf" width={32} height={32} className="opacity-50 hover:opacity-80 transition-opacity" />
        </div>
        <div className="animate-float-delay-2">
          <Image src="/images/emerald.webp" alt="Emerald" width={32} height={32} className="opacity-50 hover:opacity-80 transition-opacity" />
        </div>
      </div>
    </div>
  );
}

function getKey(modpack: NormalizedModpack): string {
  if (isModrinthModpack(modpack)) return `mr-${modpack.projectId}`;
  return `cf-${modpack.id}`;
}
