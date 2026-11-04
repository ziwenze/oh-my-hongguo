import electron from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { FavoriteItem, WatchHistoryItem } from '../../shared/types.js';

export interface StoreSchema {
  version: number;
  history: WatchHistoryItem[];
  favorites: FavoriteItem[];
}

export const CURRENT_SCHEMA_VERSION = 1;

export function createDefaultStore(): StoreSchema {
  return {
    version: CURRENT_SCHEMA_VERSION,
    history: [],
    favorites: [],
  };
}

export class DataStore {
  private storeDir: string;
  private filePath: string;
  private backupPath: string;
  private tmpPath: string;
  private cache: StoreSchema = createDefaultStore();
  private saveTimeout: NodeJS.Timeout | null = null;
  private isLoaded = false;
  // 写入锁，确保异步 persist 串行化，不产生文件争用
  private writeQueue: Promise<void> = Promise.resolve();
  // 内存版本与落盘版本标记，协调异步持久化与退出前 flushSync
  private currentMemoryVersion = 0;
  private lastWrittenVersion = 0;

  constructor(customDir?: string) {
    if (customDir) {
      this.storeDir = customDir;
    } else {
      const app = (electron as any)?.app;
      const baseDir = app?.getPath ? app.getPath('userData') : process.cwd();
      this.storeDir = path.join(baseDir, 'data');
    }

    this.filePath = path.join(this.storeDir, 'store.json');
    this.backupPath = path.join(this.storeDir, 'store.json.bak');
    this.tmpPath = path.join(this.storeDir, 'store.json.tmp');

    // 优雅退出前强制刷盘
    const app = (electron as any)?.app;
    if (app?.on) {
      app.on('before-quit', () => {
        this.flushSync();
      });
    }
  }

  // Schema 版本迁移
  private migrateSchema(raw: any): StoreSchema {
    if (!raw || typeof raw !== 'object') {
      return createDefaultStore();
    }
    const version = typeof raw.version === 'number' ? raw.version : 0;
    const history: WatchHistoryItem[] = Array.isArray(raw.history) ? raw.history : [];
    const favorites: FavoriteItem[] = Array.isArray(raw.favorites) ? raw.favorites : [];

    // 版本 0 -> 版本 1 迁移逻辑
    if (version < 1) {
      console.log('[DataStore] Migrating schema from version', version, 'to 1');
      // 保证字段类型完备
      const sanitizedHistory = history.map((h) => ({
        seriesId: String(h.seriesId || ''),
        seriesTitle: String(h.seriesTitle || ''),
        episodeId: String(h.episodeId || ''),
        episodeNumber: Number(h.episodeNumber || 1),
        episodeTitle: String(h.episodeTitle || ''),
        positionSeconds: Number(h.positionSeconds || 0),
        durationSeconds: Number(h.durationSeconds || 0),
        progressPercentage: Number(h.progressPercentage || 0),
        updatedAt: Number(h.updatedAt || Date.now()),
        cachedCoverUrl: h.cachedCoverUrl ? String(h.cachedCoverUrl) : undefined,
        cachedCoverExpiresAt: h.cachedCoverExpiresAt ? String(h.cachedCoverExpiresAt) : undefined,
      }));

      return {
        version: CURRENT_SCHEMA_VERSION,
        history: sanitizedHistory,
        favorites,
      };
    }

    return {
      version: CURRENT_SCHEMA_VERSION,
      history,
      favorites,
    };
  }

  public async load(): Promise<void> {
    if (this.isLoaded) return;
    await fs.mkdir(this.storeDir, { recursive: true, mode: 0o700 });

    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      this.cache = this.migrateSchema(parsed);
      this.isLoaded = true;
    } catch (mainErr) {
      // 主文件解析失败，尝试从 .bak 恢复
      try {
        const bakContent = await fs.readFile(this.backupPath, 'utf8');
        const parsedBak = JSON.parse(bakContent);
        this.cache = this.migrateSchema(parsedBak);
        this.isLoaded = true;
        console.warn('[DataStore] Successfully recovered store from .bak backup file');
      } catch (bakErr) {
        // 主文件和备份均损坏：绝不静默抹除损坏文件，将其重命名留存现场，再重置为空存储
        try {
          const corruptedPath = path.join(this.storeDir, `store.corrupted.${Date.now()}`);
          await fs.rename(this.filePath, corruptedPath).catch(() => {});
          console.error('[DataStore] Both main and backup store corrupted. Archived corrupted file to:', corruptedPath);
        } catch {
          // 容错
        }
        this.cache = createDefaultStore();
        this.isLoaded = true;
      }
    }
  }

  private triggerSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    // 500ms 防抖节流
    this.saveTimeout = setTimeout(() => {
      this.enqueuePersist();
    }, 500);
  }

  // 串行化写入队列，避免多次异步 persist 并发争用同一个 .tmp 文件
  private enqueuePersist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.executeAtomicWrite();
      } catch (err) {
        console.error('[DataStore] Atomic write failed:', err);
      }
    });
    return this.writeQueue;
  }

  private async executeAtomicWrite(): Promise<void> {
    const versionToWrite = this.currentMemoryVersion;
    const data = JSON.stringify(this.cache, null, 2);
    // 1. 写入带有唯一 PID 与时间戳特征的 tmp 文件
    const uniqueTmp = `${this.tmpPath}.${process.pid}.${Date.now()}`;
    await fs.writeFile(uniqueTmp, data, 'utf8');

    // 2. 校验写入文件完整性
    const verify = await fs.readFile(uniqueTmp, 'utf8');
    JSON.parse(verify);

    // 3. 系统原子重命名覆盖目标文件
    await fs.rename(uniqueTmp, this.filePath);

    // 4. 同步更新备份文件
    await fs.copyFile(this.filePath, this.backupPath).catch((err) => {
      console.warn('[DataStore] Failed to update .bak file:', err);
    });

    this.lastWrittenVersion = Math.max(this.lastWrittenVersion, versionToWrite);
  }

  public flushSync(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.currentMemoryVersion > this.lastWrittenVersion) {
      try {
        const data = JSON.stringify(this.cache, null, 2);
        const uniqueTmp = `${this.tmpPath}.${process.pid}.${Date.now()}.sync`;
        fsSync.writeFileSync(uniqueTmp, data, 'utf8');
        fsSync.renameSync(uniqueTmp, this.filePath);
        fsSync.copyFileSync(this.filePath, this.backupPath);
        this.lastWrittenVersion = this.currentMemoryVersion;
      } catch (err) {
        console.error('[DataStore] flushSync failed:', err);
      }
    }
  }

  // --- 历史记录接口 ---
  public async getHistory(): Promise<WatchHistoryItem[]> {
    await this.load();
    return [...this.cache.history].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async saveHistory(item: WatchHistoryItem): Promise<void> {
    await this.load();
    this.currentMemoryVersion++;
    const idx = this.cache.history.findIndex((h) => h.seriesId === item.seriesId);
    if (idx >= 0) {
      this.cache.history[idx] = { ...item, updatedAt: Date.now() };
    } else {
      this.cache.history.unshift({ ...item, updatedAt: Date.now() });
      if (this.cache.history.length > 200) {
        this.cache.history.pop();
      }
    }
    this.triggerSave();
  }

  public async clearHistory(): Promise<void> {
    await this.load();
    this.currentMemoryVersion++;
    this.cache.history = [];
    this.triggerSave();
  }

  // --- 追剧收藏接口 ---
  public async getFavorites(): Promise<FavoriteItem[]> {
    await this.load();
    return [...this.cache.favorites].sort((a, b) => b.addedAt - a.addedAt);
  }

  public async toggleFavorite(item: FavoriteItem): Promise<boolean> {
    await this.load();
    this.currentMemoryVersion++;
    const idx = this.cache.favorites.findIndex((f) => f.seriesId === item.seriesId);
    let isFavorited = false;
    if (idx >= 0) {
      this.cache.favorites.splice(idx, 1);
      isFavorited = false;
    } else {
      this.cache.favorites.unshift({ ...item, addedAt: Date.now() });
      isFavorited = true;
    }
    this.triggerSave();
    return isFavorited;
  }

  // 供测试使用的同步持久化等待
  public async flushAsync(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.enqueuePersist();
  }
}

export const dataStore = new DataStore();
