import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, HandlerDetails } from 'electron';
import path from 'node:path';
import url from 'node:url';
import { fileURLToPath } from 'node:url';
import { sdkAdapter } from './sdk/adapter.js';
import { dataStore } from './store/dataStore.js';
import { playbackCoordinator } from './session/coordinator.js';
import { setupSystemTray } from './tray.js';
import type { FavoriteItem, PlaybackSessionState, SystemDiagnostics, WatchHistoryItem } from '../shared/types.js';

const { app, BrowserWindow, ipcMain, shell } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 安全设置 userData 目录，隔离在独立空间，避免 Chromium 默认路径权限冲突
if (app) {
  const defaultUserData = process.env.OHG_USER_DATA_DIR || path.join(app.getPath('appData'), 'OhMyHongguo');
  try {
    app.setPath('userData', defaultUserData);
  } catch {
    try {
      app.setPath('userData', path.join(app.getPath('temp'), 'oh-my-hongguo'));
    } catch {
      // 容错
    }
  }
}

let mainWindow: BrowserWindowType | null = null;

// 严格限定生产模式可信 origin 为打包目录下的 dist
const prodDistUrl = url.pathToFileURL(path.resolve(__dirname, '../dist/')).href;

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
  // 生产模式：严格限定必须来自打包目录下的 dist 静态资源
  return frameUrl.startsWith(prodDistUrl);
}

function assertSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('[Security] Unauthorized IPC invocation from untrusted frame');
  }
}

export function getMainWindow(): BrowserWindowType | null {
  return mainWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    show: process.env.OHG_SMOKE_TEST !== '1',
    title: 'Oh-My-Hongguo · 红果短剧',
    backgroundColor: '#0d0f12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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
        isAllowed = navigationUrl.startsWith(prodDistUrl);
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
    const channel = typeof opts.channel === 'string' ? opts.channel.slice(0, 50) : undefined;
    const cursor = typeof opts.cursor === 'string' ? opts.cursor.slice(0, 200) : undefined;
    return await sdkAdapter.getDiscover({ channel, cursor });
  });

  // 2. 搜索短剧
  ipcMain.handle('sdk:searchDramas', async (event, query: unknown, options?: unknown) => {
    assertSender(event);
    if (typeof query !== 'string' || !query.trim()) {
      throw new TypeError('[IPC] query must be a non-empty string');
    }
    const cleanQuery = query.trim().slice(0, 100);
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const cursor = typeof opts.cursor === 'string' ? opts.cursor.slice(0, 200) : undefined;
    return await sdkAdapter.search(cleanQuery, { cursor });
  });

  // 3. 搜索联想
  ipcMain.handle('sdk:getSearchSuggestions', async (event, prefix: unknown) => {
    assertSender(event);
    if (typeof prefix !== 'string') return [];
    return await sdkAdapter.suggest(prefix.slice(0, 50));
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
    return await sdkAdapter.getSeriesDetail(seriesId.trim().slice(0, 50));
  });

  // 6. 分集查询 (受控分页，防巨型请求)
  ipcMain.handle('sdk:getEpisodes', async (event, seriesId: unknown, options?: unknown) => {
    assertSender(event);
    if (typeof seriesId !== 'string' || !seriesId.trim()) {
      throw new TypeError('[IPC] seriesId must be a non-empty string');
    }
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const cursor = typeof opts.cursor === 'string' ? opts.cursor.slice(0, 200) : undefined;
    const pageSize =
      typeof opts.pageSize === 'number' && Number.isFinite(opts.pageSize)
        ? Math.min(100, Math.max(1, Math.floor(opts.pageSize)))
        : 30;
    return await sdkAdapter.listEpisodes(seriesId.trim().slice(0, 50), { cursor, pageSize });
  });

  // 6.5 短剧排行榜
  ipcMain.handle('sdk:getShortRank', async (event, options?: unknown) => {
    assertSender(event);
    const opts = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const content = typeof opts.content === 'string' ? opts.content.slice(0, 50) : undefined;
    const board = typeof opts.board === 'string' ? opts.board.slice(0, 50) : undefined;
    const cursor = typeof opts.cursor === 'string' ? opts.cursor.slice(0, 200) : undefined;
    return await sdkAdapter.getShortRank({ content, board, cursor });
  });

  // 7. 播放源解析
  ipcMain.handle('sdk:resolvePlaybackSource', async (event, episodeId: unknown) => {
    assertSender(event);
    if (typeof episodeId !== 'string' || !episodeId.trim()) {
      throw new TypeError('[IPC] episodeId must be a non-empty string');
    }
    return await sdkAdapter.resolvePlayback(episodeId.trim().slice(0, 50));
  });

  // 7.5 播放会话协调与断点同步 (全字段运行时类型安全校验)
  ipcMain.handle('playback:startSession', async (event, session: unknown) => {
    assertSender(event);
    if (!session || typeof session !== 'object') {
      throw new TypeError('[IPC] session must be an object');
    }
    const s = session as Record<string, unknown>;
    if (typeof s.seriesId !== 'string' || !s.seriesId.trim()) {
      throw new TypeError('[IPC] session.seriesId must be a non-empty string');
    }
    if (typeof s.episodeId !== 'string' || !s.episodeId.trim()) {
      throw new TypeError('[IPC] session.episodeId must be a non-empty string');
    }
    const seriesTitle = typeof s.seriesTitle === 'string' ? s.seriesTitle.slice(0, 200) : '';
    const episodeTitle = typeof s.episodeTitle === 'string' ? s.episodeTitle.slice(0, 200) : '';
    const episodeNumber =
      typeof s.episodeNumber === 'number' && Number.isFinite(s.episodeNumber) ? Math.max(1, Math.floor(s.episodeNumber)) : 1;
    const positionSeconds =
      typeof s.positionSeconds === 'number' && Number.isFinite(s.positionSeconds)
        ? Math.max(0, s.positionSeconds)
        : 0;
    const durationSeconds =
      typeof s.durationSeconds === 'number' && Number.isFinite(s.durationSeconds)
        ? Math.max(0, s.durationSeconds)
        : 0;

    return await playbackCoordinator.startSession({
      seriesId: s.seriesId.trim().slice(0, 50),
      seriesTitle,
      episodeId: s.episodeId.trim().slice(0, 50),
      episodeNumber,
      episodeTitle,
      positionSeconds,
      durationSeconds,
    });
  });

  ipcMain.handle('playback:updateStatus', async (event, status: unknown, errorMessage?: unknown) => {
    assertSender(event);
    if (typeof status !== 'string') return;
    const validStatuses = ['idle', 'resolving', 'ready', 'playing', 'paused', 'ended', 'error'];
    if (!validStatuses.includes(status)) return;
    const err = typeof errorMessage === 'string' ? errorMessage.slice(0, 500) : undefined;
    await playbackCoordinator.updateStatus(status as any, err);
  });

  ipcMain.handle('playback:updateProgress', async (event, progress: unknown) => {
    assertSender(event);
    if (!progress || typeof progress !== 'object') return;
    const p = progress as Record<string, unknown>;
    if (typeof p.positionSeconds !== 'number' || !Number.isFinite(p.positionSeconds) || p.positionSeconds < 0) return;
    const dur =
      typeof p.durationSeconds === 'number' && Number.isFinite(p.durationSeconds) && p.durationSeconds >= 0
        ? p.durationSeconds
        : undefined;
    await playbackCoordinator.updateProgress({
      positionSeconds: p.positionSeconds,
      durationSeconds: dur,
    });
  });

  ipcMain.handle('playback:getCurrentSession', async (event) => {
    assertSender(event);
    return playbackCoordinator.getCurrentSession();
  });

  ipcMain.handle('playback:closeSession', async (event) => {
    assertSender(event);
    await playbackCoordinator.closeSession();
  });

  // 8. 历史记录 (严格字段校验)
  ipcMain.handle('store:getHistory', async (event) => {
    assertSender(event);
    return await dataStore.getHistory();
  });

  ipcMain.handle('store:saveHistory', async (event, item: unknown) => {
    assertSender(event);
    if (!item || typeof item !== 'object') {
      throw new TypeError('[IPC] item must be an object');
    }
    const r = item as Record<string, unknown>;
    if (typeof r.seriesId !== 'string' || !r.seriesId.trim()) {
      throw new TypeError('[IPC] History item missing seriesId');
    }
    if (typeof r.episodeId !== 'string' || !r.episodeId.trim()) {
      throw new TypeError('[IPC] History item missing episodeId');
    }

    const record: WatchHistoryItem = {
      seriesId: r.seriesId.trim().slice(0, 50),
      seriesTitle: typeof r.seriesTitle === 'string' ? r.seriesTitle.slice(0, 200) : '',
      episodeId: r.episodeId.trim().slice(0, 50),
      episodeNumber: typeof r.episodeNumber === 'number' && Number.isFinite(r.episodeNumber) ? Math.max(1, Math.floor(r.episodeNumber)) : 1,
      episodeTitle: typeof r.episodeTitle === 'string' ? r.episodeTitle.slice(0, 200) : '',
      positionSeconds: typeof r.positionSeconds === 'number' && Number.isFinite(r.positionSeconds) ? Math.max(0, r.positionSeconds) : 0,
      durationSeconds: typeof r.durationSeconds === 'number' && Number.isFinite(r.durationSeconds) ? Math.max(0, r.durationSeconds) : 0,
      progressPercentage: typeof r.progressPercentage === 'number' && Number.isFinite(r.progressPercentage) ? Math.min(100, Math.max(0, r.progressPercentage)) : 0,
      updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now(),
      cachedCoverUrl: typeof r.cachedCoverUrl === 'string' ? r.cachedCoverUrl.slice(0, 500) : undefined,
      cachedCoverExpiresAt: typeof r.cachedCoverExpiresAt === 'string' ? r.cachedCoverExpiresAt.slice(0, 50) : undefined,
    };

    return await dataStore.saveHistory(record);
  });

  ipcMain.handle('store:clearHistory', async (event) => {
    assertSender(event);
    return await dataStore.clearHistory();
  });

  // 9. 追剧收藏 (严格字段校验)
  ipcMain.handle('store:getFavorites', async (event) => {
    assertSender(event);
    return await dataStore.getFavorites();
  });

  ipcMain.handle('store:toggleFavorite', async (event, item: unknown) => {
    assertSender(event);
    if (!item || typeof item !== 'object') {
      throw new TypeError('[IPC] item must be an object');
    }
    const f = item as Record<string, unknown>;
    if (typeof f.seriesId !== 'string' || !f.seriesId.trim()) {
      throw new TypeError('[IPC] Favorite item missing seriesId');
    }

    const fav: FavoriteItem = {
      seriesId: f.seriesId.trim().slice(0, 50),
      seriesTitle: typeof f.seriesTitle === 'string' ? f.seriesTitle.slice(0, 200) : '',
      cachedCoverUrl: typeof f.cachedCoverUrl === 'string' ? f.cachedCoverUrl.slice(0, 500) : undefined,
      cachedCoverExpiresAt: typeof f.cachedCoverExpiresAt === 'string' ? f.cachedCoverExpiresAt.slice(0, 50) : undefined,
      episodeCount: typeof f.episodeCount === 'number' && Number.isFinite(f.episodeCount) ? Math.max(0, Math.floor(f.episodeCount)) : 0,
      addedAt: typeof f.addedAt === 'number' && Number.isFinite(f.addedAt) ? f.addedAt : Date.now(),
    };

    return await dataStore.toggleFavorite(fav);
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
  setupSystemTray(getMainWindow);

  // 自动化 GUI 冒烟测试模式 (验证 BrowserWindow 启动、Preload 注入与全业务 IPC 往返)
  if (process.env.OHG_SMOKE_TEST === '1' && mainWindow) {
    const smokeTimeout = setTimeout(() => {
      console.error('[Smoke] Timeout waiting for did-finish-load');
      process.exit(1);
    }, 15000);

    mainWindow.webContents.on('did-finish-load', async () => {
      clearTimeout(smokeTimeout);
      console.log('[Smoke] Window loaded index.html successfully!');
      try {
        const testScript = `(async () => {
          if (!window.electronAPI) throw new Error('window.electronAPI not exposed in renderer frame');

          const diag = await window.electronAPI.getDiagnostics();
          if (!diag || !diag.electronVersion) throw new Error('getDiagnostics failed');

          const discover = await window.electronAPI.getDiscover();
          if (!discover.items || discover.items.length === 0) throw new Error('getDiscover returned empty items');

          const detail = await window.electronAPI.getDramaDetail('mock_series_1');
          if (!detail || detail.id !== 'mock_series_1') throw new Error('getDramaDetail failed');

          const episodes = await window.electronAPI.getEpisodes('mock_series_1', { pageSize: 5 });
          if (!episodes.items || episodes.items.length !== 5) throw new Error('getEpisodes pageSize mismatch');

          const rank = await window.electronAPI.getShortRank();
          if (!rank.items || rank.items.length === 0) throw new Error('getShortRank failed');

          const suggestions = await window.electronAPI.getSearchSuggestions('战神');
          if (!suggestions || suggestions.length === 0) throw new Error('getSearchSuggestions failed');

          const hot = await window.electronAPI.getHotSearch();
          if (!hot.hotQueries) throw new Error('getHotSearch failed');

          await window.electronAPI.saveHistory({
            seriesId: 'mock_series_1',
            seriesTitle: '测试精选短剧1',
            episodeId: 'ep_1',
            episodeNumber: 1,
            episodeTitle: '第1集',
            positionSeconds: 22.5,
            durationSeconds: 120,
            progressPercentage: 18,
            updatedAt: Date.now(),
          });
          const history = await window.electronAPI.getHistory();
          if (history.length === 0 || history[0].seriesId !== 'mock_series_1') {
            throw new Error('History persistence over IPC failed');
          }

          const session = await window.electronAPI.startSession({
            seriesId: 'mock_series_1',
            seriesTitle: '测试精选短剧1',
            episodeId: 'ep_1',
            episodeNumber: 1,
            episodeTitle: '第1集',
            positionSeconds: 22.5,
            durationSeconds: 120,
          });
          if (session.status !== 'resolving') throw new Error('startSession must start in resolving status');

          await window.electronAPI.updateSessionStatus('ready');
          await window.electronAPI.updateSessionProgress({ positionSeconds: 30, durationSeconds: 120 });
          const curr = await window.electronAPI.getCurrentSession();
          if (!curr || curr.status !== 'ready') throw new Error('Session state transition failed');

          await window.electronAPI.closeSession();

          const source = await window.electronAPI.resolvePlaybackSource('ep_1');
          if (!source || !source.streams || source.streams.length === 0) throw new Error('resolvePlaybackSource failed');

          return {
            diagPlatform: diag.platform,
            discoverCount: discover.items.length,
            episodesCount: episodes.items.length,
            historyCount: history.length,
            playbackStreams: source.streams.length,
          };
        })()`;

        const smokeResult = await mainWindow!.webContents.executeJavaScript(testScript);
        console.log('[Smoke] Successfully verified full business IPC & ContextBridge pipeline in real window:', smokeResult);

        mainWindow?.destroy();
        app.quit();
        process.exit(0);
      } catch (err) {
        console.error('[Smoke] Failure in renderer context:', err);
        mainWindow?.destroy();
        app.quit();
        process.exit(1);
      }
    });
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
