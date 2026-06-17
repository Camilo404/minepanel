import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import archiver from 'archiver';

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  extension?: string;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly SERVERS_DIR: string;

  constructor(private readonly configService: ConfigService) {
    this.SERVERS_DIR = this.configService.get('serversDir');
    fs.ensureDirSync(path.join(this.SERVERS_DIR, '.world', 'worlds'));
  }

  private getBasePath(serverId: string): string {
    // "_root" means the servers directory itself
    if (serverId === '_root') {
      return this.SERVERS_DIR;
    }

    // ".world" means global world library directory
    if (serverId === '.world') {
      return path.join(this.SERVERS_DIR, '.world', 'worlds');
    }

    const canonical = path.join(this.SERVERS_DIR, serverId, 'mc-data');

    if (this.isExistingNonEmptyDir(canonical)) {
      return canonical;
    }

    const composed = this.resolveComposeDataMount(serverId);
    if (composed && this.isExistingNonEmptyDir(composed)) {
      return composed;
    }

    return canonical;
  }

  private isExistingNonEmptyDir(dirPath: string): boolean {
    try {
      if (!fs.existsSync(dirPath)) return false;
      const stat = fs.statSync(dirPath);
      return stat.isDirectory() && fs.readdirSync(dirPath).length > 0;
    } catch {
      return false;
    }
  }

  private resolveComposeDataMount(serverId: string): string | null {
    try {
      const composePath = path.join(this.SERVERS_DIR, serverId, 'docker-compose.yml');
      if (!fs.existsSync(composePath)) return null;

      const content = fs.readFileSync(composePath, 'utf8');
      const parsed = yaml.load(content) as { services?: { mc?: { volumes?: unknown } } } | null;
      const volumes = parsed?.services?.mc?.volumes;
      if (!Array.isArray(volumes)) return null;

      for (const entry of volumes) {
        const parts = String(entry).split(':');
        if (parts.length < 2) continue;
        const host = parts[0];
        const target = parts[1];
        if (target !== '/data') continue;

        const looksLikePath = host.startsWith('/') || host.startsWith('.') || /^[A-Za-z]:[\\/]/.test(host);
        if (!looksLikePath) continue;

        return path.resolve(path.dirname(composePath), host);
      }
      return null;
    } catch (error) {
      this.logger.warn(`Failed to resolve /data mount for ${serverId}: ${(error as Error).message}`);
      return null;
    }
  }

  private validatePath(serverId: string, filePath: string): string {
    const basePath = path.normalize(this.getBasePath(serverId));
    const fullPath = path.join(basePath, filePath || '');
    const normalized = path.normalize(fullPath);

    // Prevent path traversal attacks
    if (!normalized.startsWith(basePath)) {
      throw new BadRequestException('Invalid path');
    }

    if (serverId === '_root') {
      const composed = this.resolveBrokenLayoutTarget(filePath);
      if (composed) return composed;
    }

    return normalized;
  }

  private resolveBrokenLayoutTarget(filePath: string): string | null {
    const parts = filePath.split(/[\\/]/).filter(Boolean);
    if (parts.length < 2) return null;
    const [targetServerId, maybeMcData, ...rest] = parts;
    if (maybeMcData !== 'mc-data') return null;

    const composedBase = this.resolveComposeDataMount(targetServerId);
    if (!composedBase) return null;

    const canonicalMcData = path.normalize(path.join(this.SERVERS_DIR, targetServerId, 'mc-data'));
    if (path.normalize(composedBase) === canonicalMcData) return null;

    const subPath = rest.join('/');
    const composedFull = subPath ? path.join(composedBase, subPath) : composedBase;

    const composedBaseNormalized = path.normalize(composedBase);
    const composedFullNormalized = path.normalize(composedFull);
    if (!composedFullNormalized.startsWith(composedBaseNormalized)) {
      return null;
    }

    return composedFullNormalized;
  }

  async listFiles(serverId: string, dirPath: string = ''): Promise<FileItem[]> {
    const fullPath = this.validatePath(serverId, dirPath);

    if (!(await fs.pathExists(fullPath))) {
      throw new NotFoundException('Directory not found');
    }

    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new BadRequestException('Path is not a directory');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: FileItem[] = [];

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry.name);
      const relativePath = path.join(dirPath, entry.name);

      try {
        const stat = await fs.stat(entryPath);
        files.push({
          name: entry.name,
          path: relativePath,
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modified: stat.mtime,
          extension: entry.isDirectory() ? undefined : path.extname(entry.name).slice(1) || undefined,
        });
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort: directories first, then by name
    return files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(serverId: string, filePath: string): Promise<{ content: string; encoding: string }> {
    const fullPath = this.validatePath(serverId, filePath);

    if (!(await fs.pathExists(fullPath))) {
      throw new NotFoundException('File not found');
    }

    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      throw new BadRequestException('Path is a directory');
    }

    // Limit file size to 5MB for text reading
    if (stats.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File too large to read (max 5MB)');
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    return { content, encoding: 'utf-8' };
  }

  async writeFile(serverId: string, filePath: string, content: string): Promise<void> {
    const fullPath = this.validatePath(serverId, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async writeFileBuffer(serverId: string, filePath: string, buffer: Buffer): Promise<void> {
    const fullPath = this.validatePath(serverId, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);
  }

  async deleteFile(serverId: string, filePath: string): Promise<void> {
    const fullPath = this.validatePath(serverId, filePath);

    if (!(await fs.pathExists(fullPath))) {
      throw new NotFoundException('File not found');
    }

    await fs.remove(fullPath);
  }

  async createDirectory(serverId: string, dirPath: string): Promise<void> {
    const fullPath = this.validatePath(serverId, dirPath);
    await fs.ensureDir(fullPath);
  }

  async rename(serverId: string, oldPath: string, newName: string): Promise<void> {
    const fullOldPath = this.validatePath(serverId, oldPath);
    const newPath = path.join(path.dirname(fullOldPath), newName);

    // Validate new path is still within server directory
    this.validatePath(serverId, path.join(path.dirname(oldPath), newName));

    if (!(await fs.pathExists(fullOldPath))) {
      throw new NotFoundException('File not found');
    }

    if (await fs.pathExists(newPath)) {
      throw new BadRequestException('A file with that name already exists');
    }

    await fs.rename(fullOldPath, newPath);
  }

  async getFileInfo(serverId: string, filePath: string): Promise<FileItem> {
    const fullPath = this.validatePath(serverId, filePath);

    if (!(await fs.pathExists(fullPath))) {
      throw new NotFoundException('File not found');
    }

    const stats = await fs.stat(fullPath);
    const name = path.basename(fullPath);

    return {
      name,
      path: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modified: stats.mtime,
      extension: stats.isDirectory() ? undefined : path.extname(name).slice(1) || undefined,
    };
  }

  getFullPath(serverId: string, filePath: string): string {
    return this.validatePath(serverId, filePath);
  }

  async createZipStream(serverId: string, dirPath: string): Promise<{ stream: archiver.Archiver; name: string }> {
    const fullPath = this.validatePath(serverId, dirPath);

    if (!(await fs.pathExists(fullPath))) {
      throw new NotFoundException('Directory not found');
    }

    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new BadRequestException('Path is not a directory');
    }

    const folderName = path.basename(fullPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.directory(fullPath, folderName);
    archive.finalize();

    return { stream: archive, name: `${folderName}.zip` };
  }
}
