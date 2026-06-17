import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface NormalizedModSearchResult {
  provider: 'curseforge' | 'modrinth';
  projectId: string;
  slug: string;
  name: string;
  summary: string;
  iconUrl?: string;
  downloads?: number;
  lastUpdated?: string;
  supportedVersions: string[];
  supportedLoaders: string[];
  latestGameVersions?: string[];
  downloadUrl?: string;
  gallery?: string[];
  body?: string;
  dateCreated?: string;
}

export interface NormalizedModSearchResponse {
  data: NormalizedModSearchResult[];
  pagination: {
    index: number;
    pageSize: number;
    resultCount: number;
    totalCount: number;
  };
}

export type ModrinthIndex = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  downloads: number;
  date_modified?: string;
  versions: string[];
  categories: string[];
  gallery?: string[];
  featured_gallery?: string | null;
  date_created?: string;
  date_published?: string;
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  loaders: string[];
  game_versions: string[];
  date_published: string;
  files: Array<{
    hashes: { sha1: string; sha512: string };
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    file_type?: string;
  }>;
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  icon_url?: string;
  downloads: number;
  followers: number;
  versions: string[];
  gallery: Array<{ url: string; raw: string; featured: boolean }>;
  date_published?: string;
  date_modified?: string;
  date_created?: string;
  loaders: string[];
  categories: string[];
  project_type: string;
  client_side: string;
  server_side: string;
}

@Injectable()
export class ModrinthService {
  private readonly apiClient: AxiosInstance;
  private readonly MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
  private readonly KNOWN_LOADERS = ['forge', 'neoforge', 'fabric', 'quilt'];
  private readonly userAgent: string;

  constructor() {
    this.userAgent = this.resolveUserAgent();
    this.apiClient = axios.create({
      baseURL: this.MODRINTH_API_BASE,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'User-Agent': this.userAgent,
      },
    });
  }

  private resolveUserAgent(): string {
    const fallback = 'minepanel/0.0.0 (https://github.com/ketbom/minepanel)';
    const envVersion = process.env.npm_package_version;
    if (envVersion && typeof envVersion === 'string') {
      return `minepanel/${envVersion} (https://github.com/ketbom/minepanel)`;
    }
    try {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
      if (pkg.version) {
        return `minepanel/${pkg.version} (https://github.com/ketbom/minepanel)`;
      }
    } catch {
      // ignore — fall back
    }
    return fallback;
  }

  async searchMods(query: {
    q?: string;
    limit?: number;
    offset?: number;
    minecraftVersion: string;
    loader?: 'forge' | 'neoforge' | 'fabric' | 'quilt';
  }): Promise<NormalizedModSearchResponse> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const offset = Math.max(query.offset ?? 0, 0);

    const facets: string[][] = [
      ['project_type:mod'],
      [`versions:${query.minecraftVersion}`],
    ];

    if (query.loader) {
      facets.push([`categories:${query.loader}`]);
    }

    try {
      const response = await this.apiClient.get<ModrinthSearchResponse>('/search', {
        params: {
          query: query.q,
          limit,
          offset,
          index: 'relevance',
          facets: JSON.stringify(facets),
        },
      });

      const normalized = response.data.hits
        .map((hit) => this.normalizeHit(hit))
        .filter((mod) => this.isCompatibleResult(mod, query.minecraftVersion, query.loader));

      return {
        data: normalized,
        pagination: {
          index: offset,
          pageSize: limit,
          resultCount: normalized.length,
          totalCount: response.data.total_hits,
        },
      };
    } catch (error) {
      console.error('Error searching Modrinth mods:', error);

      if (axios.isAxiosError(error)) {
        throw new HttpException(
          error.response?.data?.description || 'Error searching mods',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error searching mods', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async searchModpacks(query: {
    q?: string;
    limit?: number;
    offset?: number;
    index?: ModrinthIndex;
  }): Promise<NormalizedModSearchResponse> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const index: ModrinthIndex = query.index ?? 'downloads';

    const facets: string[][] = [['project_type:modpack']];

    try {
      const response = await this.apiClient.get<ModrinthSearchResponse>('/search', {
        params: {
          query: query.q,
          limit,
          offset,
          index,
          facets: JSON.stringify(facets),
        },
      });

      const baseHits = response.data.hits.map((hit) => this.normalizeHit(hit));

      const enriched = await Promise.all(
        baseHits.map(async (hit) => {
          try {
            const detail = await this.getModpack(hit.slug);
            return {
              ...hit,
              latestGameVersions: detail.latestGameVersions,
              downloadUrl: detail.downloadUrl,
              gallery: detail.gallery,
              body: detail.body,
              dateCreated: detail.dateCreated ?? hit.dateCreated,
            };
          } catch (err) {
            console.warn(`Modrinth modpack detail fetch failed for ${hit.slug}:`, err);
            return hit;
          }
        }),
      );

      return {
        data: enriched,
        pagination: {
          index: offset,
          pageSize: limit,
          resultCount: enriched.length,
          totalCount: response.data.total_hits,
        },
      };
    } catch (error) {
      console.error('Error searching Modrinth modpacks:', error);

      if (axios.isAxiosError(error)) {
        throw new HttpException(
          error.response?.data?.description || 'Error searching modpacks',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error searching modpacks', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getModpack(idOrSlug: string): Promise<NormalizedModSearchResult> {
    if (!idOrSlug) {
      throw new HttpException('idOrSlug is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const [projectResponse, versionsResponse] = await Promise.all([
        this.apiClient.get<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`),
        this.apiClient.get<ModrinthVersion[]>(`/project/${encodeURIComponent(idOrSlug)}/version`),
      ]);

      const project = projectResponse.data;
      const versions = versionsResponse.data;

      const chosen = this.pickLatestStableVersion(versions);
      const primaryFile = chosen?.files.find((f) => f.primary) ?? chosen?.files[0];

      const gallery = (project.gallery ?? [])
        .map((g) => g.url)
        .filter((url): url is string => typeof url === 'string' && url.length > 0);

      return {
        provider: 'modrinth',
        projectId: project.id,
        slug: project.slug,
        name: project.title,
        summary: project.description,
        iconUrl: project.icon_url,
        downloads: project.downloads,
        lastUpdated: project.date_modified,
        dateCreated: project.date_created ?? project.date_published,
        supportedVersions: chosen?.game_versions ?? [],
        supportedLoaders: project.loaders ?? [],
        latestGameVersions: chosen?.game_versions,
        downloadUrl: primaryFile?.url,
        gallery,
        body: project.body,
      };
    } catch (error) {
      console.error(`Error fetching Modrinth modpack ${idOrSlug}:`, error);

      if (axios.isAxiosError(error)) {
        throw new HttpException(
          error.response?.data?.description || `Error fetching modpack ${idOrSlug}`,
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(`Error fetching modpack ${idOrSlug}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private pickLatestStableVersion(versions: ModrinthVersion[]): ModrinthVersion | null {
    if (!Array.isArray(versions) || versions.length === 0) {
      return null;
    }
    const sorted = [...versions].sort(
      (a, b) => new Date(b.date_published).getTime() - new Date(a.date_published).getTime(),
    );
    const release = sorted.find((v) => v.version_type === 'release');
    if (release) return release;
    const beta = sorted.find((v) => v.version_type === 'beta');
    if (beta) return beta;
    return sorted[0];
  }

  private normalizeHit(hit: ModrinthSearchHit): NormalizedModSearchResult {
    const supportedLoaders = (hit.categories ?? []).filter((category) =>
      this.KNOWN_LOADERS.includes(category.toLowerCase()),
    );

    return {
      provider: 'modrinth',
      projectId: hit.project_id,
      slug: hit.slug,
      name: hit.title,
      summary: hit.description ?? '',
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      lastUpdated: hit.date_modified,
      dateCreated: hit.date_created ?? hit.date_published,
      supportedVersions: hit.versions ?? [],
      supportedLoaders,
      gallery: hit.gallery,
    };
  }

  private isCompatibleResult(
    mod: NormalizedModSearchResult,
    minecraftVersion: string,
    loader?: 'forge' | 'neoforge' | 'fabric' | 'quilt',
  ): boolean {
    const hasVersion = mod.supportedVersions.some((version) => version === minecraftVersion);
    if (!hasVersion) return false;

    if (!loader) return true;
    if (mod.supportedLoaders.length === 0) return true;
    return mod.supportedLoaders.includes(loader);
  }
}
