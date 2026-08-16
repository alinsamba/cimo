import { readdir, stat } from 'node:fs/promises';
import { resolve, extname, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MediaDatabase } from './db';
import type { MediaItem } from '../core/types';

export const SUPPORTED_EXTENSIONS: Record<string, true> = {
  '.mp4': true,
  '.mkv': true,
  '.webm': true,
  '.avi': true,
  '.mov': true,
  '.flv': true,
  '.mp3': true,
  '.flac': true,
  '.wav': true,
  '.aac': true,
  '.ogg': true,
  '.m4a': true,
  '.opus': true,
};

export interface ScannerOptions {
  maxDepth?: number;
  batchSize?: number;
  onProgress?: (progress: ScannerProgress) => void;
  onError?: (error: { path: string; error: unknown }) => void;
}

export interface ScannerProgress {
  scannedFiles: number;
  ingestedFiles: number;
  currentPath: string;
}

export interface ScanResult {
  totalScanned: number;
  totalIngested: number;
  items: MediaItem[];
  errors: Array<{ path: string; error: string }>;
}

export class DirectoryScanner {
  private db: MediaDatabase;
  private defaultOptions: Required<Omit<ScannerOptions, 'onProgress' | 'onError'>>;

  constructor(db: MediaDatabase, options?: ScannerOptions) {
    this.db = db;
    this.defaultOptions = {
      maxDepth: options?.maxDepth ?? 15,
      batchSize: options?.batchSize ?? 50,
    };
  }

  public isSupported(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return Boolean(SUPPORTED_EXTENSIONS[ext]);
  }

  public async extractFileMetadata(
    filePath: string
  ): Promise<(Partial<MediaItem> & { uri: string; title: string }) | null> {
    try {
      const resolvedPath = resolve(filePath);
      const fileStat = await stat(resolvedPath);

      if (!fileStat.isFile()) {
        return null;
      }

      const ext = extname(resolvedPath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS[ext]) {
        return null;
      }

      const parsed = parse(resolvedPath);
      const rawName = parsed.name;

      // Extract artist and title if formatted as "Artist - Title"
      let artist: string | undefined;
      let title = rawName;
      const separatorIndex = rawName.indexOf(' - ');
      if (separatorIndex > 0) {
        artist = rawName.slice(0, separatorIndex).trim();
        title = rawName.slice(separatorIndex + 3).trim();
      }

      const format = ext.startsWith('.') ? ext.slice(1) : ext;
      const uri = pathToFileURL(resolvedPath).href;

      return {
        uri,
        path: resolvedPath,
        title: title || rawName || parsed.base,
        artist,
        duration: 0,
        addedAt: Date.now(),
        metadata: {
          title: title || rawName || parsed.base,
          artist,
          format,
          fileSize: fileStat.size,
          path: resolvedPath,
        },
      };
    } catch {
      return null;
    }
  }

  public async scanDirectory(
    dirPath: string,
    options?: ScannerOptions
  ): Promise<ScanResult> {
    const maxDepth = options?.maxDepth ?? this.defaultOptions.maxDepth;
    const batchSize = options?.batchSize ?? this.defaultOptions.batchSize;
    const onProgress = options?.onProgress;
    const onError = options?.onError;

    const resolvedDir = resolve(dirPath);
    const discoveredPaths: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    const walk = async (currentDir: string, currentDepth: number): Promise<void> => {
      if (currentDepth > maxDepth) return;

      try {
        const entries = await readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = resolve(currentDir, entry.name);

          if (entry.isDirectory()) {
            await walk(entryPath, currentDepth + 1);
          } else if (entry.isFile()) {
            if (this.isSupported(entry.name)) {
              discoveredPaths.push(entryPath);
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ path: currentDir, error: message });
        onError?.({ path: currentDir, error: err });
      }
    };

    await walk(resolvedDir, 0);

    const ingestedItems: MediaItem[] = [];
    let scannedCount = 0;
    let batch: (Partial<MediaItem> & { uri: string; title: string })[] = [];

    const flushBatch = () => {
      for (const item of batch) {
        try {
          const saved = this.db.saveMediaItem(item);
          ingestedItems.push(saved);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ path: item.path ?? item.uri, error: message });
          onError?.({ path: item.path ?? item.uri, error: err });
        }
      }
      batch = [];
    };

    for (const filePath of discoveredPaths) {
      scannedCount++;
      const meta = await this.extractFileMetadata(filePath);
      if (meta) {
        batch.push(meta);
      }

      onProgress?.({
        scannedFiles: scannedCount,
        ingestedFiles: ingestedItems.length + batch.length,
        currentPath: filePath,
      });

      if (batch.length >= batchSize) {
        flushBatch();
      }
    }

    if (batch.length > 0) {
      flushBatch();
    }

    return {
      totalScanned: scannedCount,
      totalIngested: ingestedItems.length,
      items: ingestedItems,
      errors,
    };
  }

  public async scanFiles(
    filePaths: string[],
    options?: ScannerOptions
  ): Promise<ScanResult> {
    const onProgress = options?.onProgress;
    const onError = options?.onError;
    const errors: Array<{ path: string; error: string }> = [];
    const items: MediaItem[] = [];
    let scannedCount = 0;

    for (const filePath of filePaths) {
      scannedCount++;
      try {
        const meta = await this.extractFileMetadata(filePath);
        if (meta) {
          const saved = this.db.saveMediaItem(meta);
          items.push(saved);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ path: filePath, error: message });
        onError?.({ path: filePath, error: err });
      }

      onProgress?.({
        scannedFiles: scannedCount,
        ingestedFiles: items.length,
        currentPath: filePath,
      });
    }

    return {
      totalScanned: scannedCount,
      totalIngested: items.length,
      items,
      errors,
    };
  }
}
