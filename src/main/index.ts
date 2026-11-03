import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, HandlerDetails } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdkAdapter } from './sdk/adapter.js';
import { dataStore } from './store/dataStore.js';
import { playbackCoordinator } from './session/coordinator.js';
import { setupSystemTray } from './tray.js';
import type { FavoriteItem, PlaybackSessionState, SystemDiagnostics, WatchHistoryItem } from '../shared/types.js';

const { app, BrowserWindow, ipcMain, shell } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindowType | null = null;

// 验证请求来源的合法性
function isAuthorizedSender(senderFrame: Electron.WebFrameMain | null): boolean {
  if (!senderFrame) return false;
  const frameUrl = senderFrame.url;
  // 开发模式：只允许 Vite 本地服务器 Origin
  if (process.env.VITE_DEV_SERVER_URL) {
    try {
      const devOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin;
      return new URL(frameUrl).origin === devOrigin;
    } catch {
      return false;
    }
  }
  // 生产模式：只允许 file: 协议
  return frameUrl.startsWith('file://');
}

function assertSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('[Security] Unauthorized IPC invocation from untrusted frame');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    title: 'Oh-My-Hongguo · 红果短剧',
    backgroundColor: '#0d0f12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 严格拦截新窗口弹窗
  mainWindow.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    const targetUrl = details.url;
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(targetUrl).catch(() => {});
      }
    } catch {
      // 忽略非法 URL
    }
    return { action: 'deny' };
  });

  // 严格拦截窗口内导航
  mainWindow.webContents.on('will-navigate', (event: Electron.Event, navigationUrl: string) => {
    let isAllowed = false;
    try {
      if (process.env.VITE_DEV_SERVER_URL) {
        const allowedOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin;
        isAllowed = new URL(navigationUrl).origin === allowedOrigin;
      } else {
        isAllowed = navigationUrl.startsWith('file://');
      }
    } catch {
      isAllowed = false;
    }

    if (!isAllowed) {
      event.preventDefault();
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          shell.openExternal(navigationUrl).catch(() => {});
        }
      } catch {
        // 忽略
      }
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  // 1. 发现推荐
  ipcMain.handle('sdk:getDiscover', async (event, options?: unknown) => {
    assertSender(event);
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const channel = typeof opts.channel === 'string' ? opts.channel : undefined;
    const cursor = typeof opts.cursor === 'string' ? opts.cursor : undefined;
    return await sdkAdapter.getDiscover({ channel, cursor });
  });

  // 2. 搜索短剧
  ipcMain.handle('sdk:searchDramas', async (event, query: unknown, options?: unknown) => {
    assertSender(event);
    if (typeof query !== 'string') {
      throw new TypeError('[IPC] query must be a string');
    }
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const cursor = typeof opts.cursor === 'string' ? opts.cursor : undefined;
    return await sdkAdapter.search(query, { cursor });
  });

  // 3. 搜索联想
  ipcMain.handle('sdk:getSearchSuggestions', async (event, prefix: unknown) => {
    assertSender(event);
    if (typeof prefix !== 'string') return [];
    return await sdkAdapter.suggest(prefix);
  });

  // 4. 热搜
  ipcMain.handle('sdk:getHotSearch', async (event) => {
    assertSender(event);
    return await sdkAdapter.getHotSearch();
  });

  // 5. 剧集详情
  ipcMain.handle('sdk:getDramaDetail', async (event, seriesId: unknown) => {
    assertSender(event);
    if (typeof seriesId !== 'string' || !seriesId.trim()) {
      throw new TypeError('[IPC] seriesId must be a non-empty string');
    }
    return await sdkAdapter.getSeriesDetail(seriesId.trim());
  });

  // 6. 分集查询
  ipcMain.handle('sdk:getEpisodes', async (event, seriesId: unknown, options?: unknown) => {
    assertSender(event);
    if (typeof seriesId !== 'string' || !seriesId.trim()) {
      throw new TypeError('[IPC] seriesId must be a non-empty string');
    }
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const cursor = typeof opts.cursor === 'string' ? opts.cursor : undefined;
    const pageSize = typeof opts.pageSize === 'number' && opts.pageSize > 0 ? opts.pageSize : undefined;
    return await sdkAdapter.listEpisodes(seriesId.trim(), { cursor, pageSize });
  });

  // 6.5 短剧排行榜
  ipcMain.handle('sdk:getShortRank', async (event, options?: unknown) => {
    assertSender(event);
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const content = typeof opts.content === 'string' ? opts.content : undefined;
    const board = typeof opts.board === 'string' ? opts.board : undefined;
    const cursor = typeof opts.cursor === 'string' ? opts.cursor : undefined;
    return await sdkAdapter.getShortRank({ content, board, cursor });
  });

  // 7. 播放源解析
  ipcMain.handle('sdk:resolvePlaybackSource', async (event, episodeId: unknown) => {
    assertSender(event);
    if (typeof episodeId !== 'string' || !episodeId.trim()) {
      throw new TypeError('[IPC] episodeId must be a non-empty string');
    }
    return await sdkAdapter.resolvePlayback(episodeId.trim());
  });

  // 7.5 播放会话协调与断点同步
  ipcMain.handle('playback:startSession', async (event, session: unknown) => {
    assertSender(event);
    if (!session || typeof session !== 'object') {
      throw new TypeError('[IPC] session must be an object');
    }
    return await playbackCoordinator.startSession(session as Omit<PlaybackSessionState, 'isPlaying'>);
  });

  ipcMain.handle('playback:updateProgress', async (event, progress: unknown) => {
    assertSender(event);
    if (!progress || typeof progress !== 'object') return;
    const p = progress as { positionSeconds: number; durationSeconds?: number };
    if (typeof p.positionSeconds === 'number') {
      await playbackCoordinator.updateProgress(p);
    }
  });

  ipcMain.handle('playback:getCurrentSession', async (event) => {
    assertSender(event);
    return playbackCoordinator.getCurrentSession();
  });

  ipcMain.handle('playback:closeSession', async (event) => {
    assertSender(event);
    await playbackCoordinator.closeSession();
  });

  // 8. 历史记录
  ipcMain.handle('store:getHistory', async (event) => {
    assertSender(event);
    return await dataStore.getHistory();
  });

  ipcMain.handle('store:saveHistory', async (event, item: unknown) => {
    assertSender(event);
    if (!item || typeof item !== 'object') {
      throw new TypeError('[IPC] item must be an object');
    }
    const record = item as Partial<WatchHistoryItem>;
    if (!record.seriesId || !record.episodeId) {
      throw new TypeError('[IPC] History item missing seriesId or episodeId');
    }
    return await dataStore.saveHistory(record as WatchHistoryItem);
  });

  ipcMain.handle('store:clearHistory', async (event) => {
    assertSender(event);
    return await dataStore.clearHistory();
  });

  // 9. 追剧收藏
  ipcMain.handle('store:getFavorites', async (event) => {
    assertSender(event);
    return await dataStore.getFavorites();
  });

  ipcMain.handle('store:toggleFavorite', async (event, item: unknown) => {
    assertSender(event);
    if (!item || typeof item !== 'object') {
      throw new TypeError('[IPC] item must be an object');
    }
    const fav = item as Partial<FavoriteItem>;
    if (!fav.seriesId) {
      throw new TypeError('[IPC] Favorite item missing seriesId');
    }
    return await dataStore.toggleFavorite(fav as FavoriteItem);
  });

  // 10. 窗口控制
  ipcMain.handle('window:toggleAlwaysOnTop', async (event) => {
    assertSender(event);
    if (!mainWindow) return false;
    const current = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!current);
    return !current;
  });

  // 11. 诊断
  ipcMain.handle('system:getDiagnostics', async (event): Promise<SystemDiagnostics> => {
    assertSender(event);
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      profilePath: sdkAdapter.getProfilePath(),
    };
  });
}

app.whenReady().then(async () => {
  try {
    await dataStore.load();
    await sdkAdapter.init();
  } catch (err) {
    console.error('[Main] Initialization warning:', err);
  }

  registerIpcHandlers();
  createWindow();
  if (mainWindow) {
    setupSystemTray(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
