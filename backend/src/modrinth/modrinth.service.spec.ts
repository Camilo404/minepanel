import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { ModrinthService } from './modrinth.service';

jest.mock('axios');

describe('ModrinthService', () => {
  let service: ModrinthService;
  const mockClient = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue(mockClient);
    service = new ModrinthService();
  });

  it('searchMods should return normalized compatible results', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        hits: [
          {
            project_id: 'A1',
            slug: 'sodium',
            title: 'Sodium',
            description: 'Rendering optimization',
            icon_url: 'https://example.com/sodium.png',
            downloads: 99999,
            date_modified: '2026-01-05T00:00:00Z',
            versions: ['1.20.1', '1.20.2'],
            categories: ['fabric', 'optimization'],
          },
          {
            project_id: 'A2',
            slug: 'forge-only-mod',
            title: 'Forge Only',
            description: 'Forge mod',
            icon_url: 'https://example.com/forge.png',
            downloads: 1200,
            date_modified: '2026-01-06T00:00:00Z',
            versions: ['1.20.1'],
            categories: ['forge'],
          },
        ],
        offset: 0,
        limit: 20,
        total_hits: 2,
      },
    });

    const result = await service.searchMods({
      q: 'performance',
      minecraftVersion: '1.20.1',
      loader: 'fabric',
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      provider: 'modrinth',
      projectId: 'A1',
      slug: 'sodium',
      supportedLoaders: ['fabric'],
    });
  });

  it('searchMods should map upstream axios errors', async () => {
    mockClient.get.mockRejectedValue({
      response: {
        status: 502,
        data: { description: 'Gateway error' },
      },
    });
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

    await expect(
      service.searchMods({
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      service.searchMods({
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY });
  });

  describe('modpacks', () => {
    it('searchModpacks should set User-Agent and project_type:modpack facet', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          hits: [
            {
              project_id: 'P1',
              slug: 'aesthetic-textures',
              title: 'Aesthetic Textures',
              description: 'Pretty pack',
              icon_url: 'https://example.com/p1.png',
              downloads: 50000,
              date_modified: '2026-02-01T00:00:00Z',
              versions: ['1.20.1'],
              categories: [],
            },
          ],
          offset: 0,
          limit: 20,
          total_hits: 1,
        },
      });

      const result = await service.searchModpacks({ limit: 20, offset: 0, index: 'downloads' });

      expect(mockClient.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            index: 'downloads',
            facets: JSON.stringify([['project_type:modpack']]),
          }),
        }),
      );
      expect(result.data[0]).toMatchObject({
        provider: 'modrinth',
        slug: 'aesthetic-textures',
      });
      expect(result.pagination.totalCount).toBe(1);
    });

    it('searchModpacks should default index to downloads', async () => {
      mockClient.get.mockResolvedValue({
        data: { hits: [], offset: 0, limit: 20, total_hits: 0 },
      });

      await service.searchModpacks({ limit: 20 });

      expect(mockClient.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({ index: 'downloads' }),
        }),
      );
    });

    it('getModpack should pick the latest release version and its primary file', async () => {
      mockClient.get
        .mockResolvedValueOnce({
          data: {
            id: 'P1',
            slug: 'aesthetic-textures',
            title: 'Aesthetic Textures',
            description: 'Pretty pack',
            body: '## About',
            icon_url: 'https://example.com/p1.png',
            downloads: 50000,
            followers: 100,
            versions: ['V1', 'V2', 'V3'],
            gallery: [{ url: 'https://example.com/g1.png', raw: 'g1', featured: true }],
            date_published: '2025-12-01T00:00:00Z',
            date_modified: '2026-02-01T00:00:00Z',
            loaders: ['minecraft'],
            categories: [],
            project_type: 'modpack',
            client_side: 'required',
            server_side: 'required',
          },
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'V3',
              name: 'beta-2',
              version_number: '0.3.0-beta.2',
              version_type: 'beta',
              loaders: ['minecraft'],
              game_versions: ['1.20.4'],
              date_published: '2026-02-05T00:00:00Z',
              files: [
                {
                  hashes: { sha1: 'h', sha512: 'h' },
                  url: 'https://cdn.modrinth.com/beta.mrpack',
                  filename: 'beta.mrpack',
                  primary: true,
                  size: 1234,
                },
              ],
            },
            {
              id: 'V2',
              name: 'release-1',
              version_number: '0.2.0',
              version_type: 'release',
              loaders: ['minecraft'],
              game_versions: ['1.20.1', '1.20.4'],
              date_published: '2026-01-15T00:00:00Z',
              files: [
                {
                  hashes: { sha1: 'h', sha512: 'h' },
                  url: 'https://cdn.modrinth.com/release.mrpack',
                  filename: 'release.mrpack',
                  primary: true,
                  size: 9999,
                },
              ],
            },
          ],
        });

      const result = await service.getModpack('aesthetic-textures');

      expect(result.provider).toBe('modrinth');
      expect(result.projectId).toBe('P1');
      expect(result.slug).toBe('aesthetic-textures');
      expect(result.latestGameVersions).toEqual(['1.20.1', '1.20.4']);
      expect(result.downloadUrl).toBe('https://cdn.modrinth.com/release.mrpack');
      expect(result.gallery).toEqual(['https://example.com/g1.png']);
    });

    it('getModpack should reject when idOrSlug is empty', async () => {
      await expect(service.getModpack('')).rejects.toBeInstanceOf(HttpException);
    });

    it('apiClient should send a non-empty User-Agent header', () => {
      // Recreate the service to inspect axios.create call
      const createMock = axios.create as jest.Mock;
      createMock.mockClear();
      new ModrinthService();
      const call = createMock.mock.calls[0][0];
      expect(call.headers['User-Agent']).toMatch(/^minepanel\//);
    });
  });
});
