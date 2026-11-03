import electron from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { FavoriteItem, WatchHistoryItem } from '../../shared/types.js';

const { app } = electron;

interface StoreSchema {
  version: number;
  history: WatchHistoryItem[];
  favorites: FavoriteItem[];
}

const DEFAULT_STORE: StoreSchema = {
  version: 1,
  history: [],
  favorites: [],
};

class DataStore {
  private storeDir: string;
  private filePath: string;
  private backupPath: string;
  private tmpPath: string;
  private cache: StoreSchema = { ...DEFAULT_STORE };
  private saveTimeout: NodeJS.Timeout | null = null;
  private isLoaded = false;

  constructor() {
    this.storeDir = path.join(app.getPath('userData'), 'data');
    this.filePath = path.join(this.storeDir, 'store.json');
    this.backupPath = path.join(this.storeDir, 'store.json.bak');
    this.tmpPath = path.join(this.storeDir, 'store.json.tmp');

    // 优雅退出前强制刷盘
    app.on('before-quit', () => {
      this.flushSync();
    });
  }

  public async load(): Promise<void> {
    if (this.isLoaded) return;
    await fs.mkdir(this.storeDir, { recursive: true, mode: 0o700 });

    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(content);
      this.isLoaded = true;
    } catch {
      // 尝试从备份恢复
      try {
        const bakContent = await fs.readFile(this.backupPath, 'utf8');
        this.cache = JSON.parse(bakContent);
        this.isLoaded = true;
        console.warn('[DataStore] Recovered store from .bak backup file');
      } catch {
        this.cache = { ...DEFAULT_STORE };
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
      this.persist().catch((err) => {
        console.error('[DataStore] Persist error:', err);
      });
    }, 500);
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify(this.cache, null, 2);
    // 1. 写入临时文件
    await fs.writeFile(this.tmpPath, data, 'utf8');
    // 2. 检查临时文件有效性
    const verify = await fs.readFile(this.tmpPath, 'utf8');
    JSON.parse(verify);
    // 3. 原子重命名覆盖目标文件
    await fs.rename(this.tmpPath, this.filePath);
    // 4. 同步更新备份文件
    await fs.copyFile(this.filePath, this.backupPath);
  }

  public flushSync(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      const data = JSON.stringify(this.cache, null, 2);
      fsSync.writeFileSync(this.tmpPath, data, 'utf8');
      fsSync.renameSync(this.tmpPath, this.filePath);
      fsSync.copyFileSync(this.filePath, this.backupPath);
    } catch {
      // 容错处理
    }
  }

  // --- 历史记录接口 ---
  public async getHistory(): Promise<WatchHistoryItem[]> {
    await this.load();
    return [...this.cache.history].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async saveHistory(item: WatchHistoryItem): Promise<void> {
    await this.load();
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
}

export const dataStore = new DataStore();
