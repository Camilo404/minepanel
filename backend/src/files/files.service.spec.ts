import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('FilesService', () => {
  let service: FilesService;
  let serversDir: string;

  beforeEach(async () => {
    serversDir = await fs.mkdtemp(path.join(os.tmpdir(), 'minepanel-files-'));

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'serversDir') return serversDir;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  afterEach(async () => {
    await fs.remove(serversDir);
  });

  describe('listFiles - base path resolution', () => {
    it('returns the global servers directory for "_root"', async () => {
      const items = await service.listFiles('_root');
      expect(Array.isArray(items)).toBe(true);
    });

    it('returns files from the canonical mc-data folder when populated', async () => {
      const serverId = 'canonical';
      const mcData = path.join(serversDir, serverId, 'mc-data');
      await fs.ensureDir(mcData);
      await fs.writeFile(path.join(mcData, 'server.properties'), 'motd=hello');

      const items = await service.listFiles(serverId);
      const names = items.map((i) => i.name);
      expect(names).toContain('server.properties');
    });

    it('falls back to the compose-defined /data mount when canonical folder is empty', async () => {
      const serverId = 'nested';
      const canonical = path.join(serversDir, serverId, 'mc-data');
      const composeDir = path.join(serversDir, serverId);
      const actualData = path.join(serversDir, 'servers', serverId, 'mc-data');

      await fs.ensureDir(canonical);
      await fs.ensureDir(actualData);
      await fs.writeFile(path.join(actualData, 'whitelist.json'), '[]');
      await fs.writeFile(
        path.join(composeDir, 'docker-compose.yml'),
        [
          'services:',
          '  mc:',
          '    volumes:',
          '      - ..\\servers\\' + serverId + '\\mc-data:/data',
          '      - ..\\servers\\' + serverId + '\\worlds:/data/.world-library/local:ro',
        ].join('\n')
      );

      const items = await service.listFiles(serverId);
      const names = items.map((i) => i.name);
      expect(names).toContain('whitelist.json');
    });

    it('keeps canonical folder when it is non-empty even if compose points elsewhere', async () => {
      const serverId = 'hybrid';
      const canonical = path.join(serversDir, serverId, 'mc-data');
      const otherData = path.join(serversDir, 'servers', serverId, 'mc-data');

      await fs.ensureDir(canonical);
      await fs.writeFile(path.join(canonical, 'from-canonical.txt'), 'x');

      await fs.ensureDir(otherData);
      await fs.writeFile(path.join(otherData, 'from-compose.txt'), 'y');

      await fs.writeFile(
        path.join(serversDir, serverId, 'docker-compose.yml'),
        ['services:', '  mc:', '    volumes:', '      - ../servers/' + serverId + '/mc-data:/data'].join('\n')
      );

      const items = await service.listFiles(serverId);
      const names = items.map((i) => i.name);
      expect(names).toContain('from-canonical.txt');
      expect(names).not.toContain('from-compose.txt');
    });

    it('returns the global world library for ".world"', async () => {
      const worldsDir = path.join(serversDir, '.world', 'worlds');
      await fs.ensureDir(worldsDir);
      await fs.writeFile(path.join(worldsDir, 'survival.dat'), 'fake');

      const items = await service.listFiles('.world');
      const names = items.map((i) => i.name);
      expect(names).toContain('survival.dat');
    });

    it('skips named volumes and only follows host-path mounts', async () => {
      const serverId = 'named';
      const canonical = path.join(serversDir, serverId, 'mc-data');
      const composeDir = path.join(serversDir, serverId);
      const actualData = path.join(serversDir, 'servers', serverId, 'mc-data');

      await fs.ensureDir(canonical);
      await fs.ensureDir(actualData);
      await fs.writeFile(path.join(actualData, 'world.dat'), 'fake');
      await fs.writeFile(
        path.join(composeDir, 'docker-compose.yml'),
        [
          'services:',
          '  mc:',
          '    volumes:',
          '      - mc-data:/data',
          '      - ..\\servers\\' + serverId + '\\mc-data:/data',
        ].join('\n')
      );

      const items = await service.listFiles(serverId);
      const names = items.map((i) => i.name);
      expect(names).toContain('world.dat');
    });
  });

  describe('listFiles - global navigation into broken layout', () => {
    it('redirects "_root/<id>/mc-data" to the compose-defined /data mount', async () => {
      const serverId = 'nested';
      const canonical = path.join(serversDir, serverId, 'mc-data');
      const composeDir = path.join(serversDir, serverId);
      const actualData = path.join(serversDir, 'servers', serverId, 'mc-data');

      await fs.ensureDir(canonical); // intentionally empty
      await fs.ensureDir(actualData);
      await fs.writeFile(path.join(actualData, 'whitelist.json'), '[]');
      await fs.writeFile(
        path.join(composeDir, 'docker-compose.yml'),
        ['services:', '  mc:', '    volumes:', '      - ..\\servers\\' + serverId + '\\mc-data:/data'].join('\n')
      );

      const items = await service.listFiles('_root', serverId + '/mc-data');
      const names = items.map((i) => i.name);
      expect(names).toContain('whitelist.json');
    });

    it('preserves the sub-path when redirecting broken layout navigation', async () => {
      const serverId = 'nested';
      const canonical = path.join(serversDir, serverId, 'mc-data');
      const composeDir = path.join(serversDir, serverId);
      const actualData = path.join(serversDir, 'servers', serverId, 'mc-data');
      const actualConfig = path.join(actualData, 'config');

      await fs.ensureDir(canonical);
      await fs.ensureDir(actualConfig);
      await fs.writeFile(path.join(actualConfig, 'paper.yml'), 'sample: 1');
      await fs.writeFile(
        path.join(composeDir, 'docker-compose.yml'),
        ['services:', '  mc:', '    volumes:', '      - ..\\servers\\' + serverId + '\\mc-data:/data'].join('\n')
      );

      const items = await service.listFiles('_root', serverId + '/mc-data/config');
      const names = items.map((i) => i.name);
      expect(names).toContain('paper.yml');
    });

    it('does not redirect when canonical folder has content (Survival case)', async () => {
      const serverId = 'survival-like';
      const canonical = path.join(serversDir, serverId, 'mc-data');
      const composeDir = path.join(serversDir, serverId);

      await fs.ensureDir(canonical);
      await fs.writeFile(path.join(canonical, 'server.properties'), 'motd=hi');
      await fs.writeFile(
        path.join(composeDir, 'docker-compose.yml'),
        ['services:', '  mc:', '    volumes:', '      - ' + canonical.replace(/\\/g, '/') + ':/data'].join('\n')
      );

      const items = await service.listFiles('_root', serverId + '/mc-data');
      const names = items.map((i) => i.name);
      expect(names).toContain('server.properties');
    });

    it('does not redirect for paths that do not match the <id>/mc-data pattern', async () => {
      // Create a non-mc-data subdirectory and verify it lists normally.
      const folderName = 'some-random-folder';
      await fs.ensureDir(path.join(serversDir, folderName));
      await fs.writeFile(path.join(serversDir, folderName, 'note.txt'), 'hi');

      const items = await service.listFiles('_root', folderName);
      const names = items.map((i) => i.name);
      expect(names).toContain('note.txt');
    });
  });
});
