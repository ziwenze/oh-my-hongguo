import electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import path from 'node:path';
import url from 'node:url';
import { fileURLToPath } from 'node:url';
import { sdkAdapter } from './sdk/adapter.js';
import { dataStore } from './store/dataStore.js';
import { playbackCoordinator } from './session/coordinator.js';
import { WindowManager } from './windows/manager.js';
import { setupSystemTray } from './tray.js';
import type { FavoriteItem, PlaybackSessionToken, SystemDiagnostics, WatchHistoryItem } from '../shared/types.js';

const { app, BrowserWindow, ipcMain } = electron;
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

// 严格限定生产模式可信 origin 为打包目录下的 dist
const prodDistUrl = url.pathToFileURL(path.resolve(__dirname, '../dist/')).href;

const windowManager = new WindowManager(prodDistUrl);

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

  // 7.5 播放会话协调与断点同步 (支持 Token 校验与窗口所有权隔离)
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

    const ownerWindowId = event.sender.id;
    windowManager.onSessionStartedByWindow(ownerWindowId);
    return await playbackCoordinator.startSession(
      {
        seriesId: s.seriesId.trim().slice(0, 50),
        seriesTitle,
        episodeId: s.episodeId.trim().slice(0, 50),
        episodeNumber,
        episodeTitle,
        positionSeconds,
        durationSeconds,
      },
      ownerWindowId
    );
  });

  ipcMain.handle('playback:updateStatus', async (event, token: unknown, status: unknown, errorMessage?: unknown) => {
    assertSender(event);
    if (!token || typeof token !== 'object') return false;
    if (typeof status !== 'string') return false;
    const validStatuses = ['idle', 'resolving', 'ready', 'playing', 'paused', 'ended', 'error'];
    if (!validStatuses.includes(status)) return false;
    const err = typeof errorMessage === 'string' ? errorMessage.slice(0, 500) : undefined;
    return await playbackCoordinator.updateStatus(token as PlaybackSessionToken, status as any, err, event.sender.id);
  });

  ipcMain.handle('playback:updateProgress', async (event, token: unknown, progress: unknown) => {
    assertSender(event);
    if (!token || typeof token !== 'object') return false;
    if (!progress || typeof progress !== 'object') return false;
    const p = progress as Record<string, unknown>;
    if (typeof p.positionSeconds !== 'number' || !Number.isFinite(p.positionSeconds) || p.positionSeconds < 0) return false;
    const dur =
      typeof p.durationSeconds === 'number' && Number.isFinite(p.durationSeconds) && p.durationSeconds >= 0
        ? p.durationSeconds
        : undefined;
    return await playbackCoordinator.updateProgress(
      token as PlaybackSessionToken,
      {
        positionSeconds: p.positionSeconds,
        durationSeconds: dur,
      },
      event.sender.id
    );
  });

  ipcMain.handle('playback:getCurrentSession', async (event) => {
    assertSender(event);
    return playbackCoordinator.getCurrentSession();
  });

  ipcMain.handle('playback:closeSession', async (event, token?: unknown) => {
    assertSender(event);
    if (!token || typeof token !== 'object') {
      return false; // 渲染层关闭必须携带合法 Token 凭证
    }
    return await playbackCoordinator.closeSession(token as PlaybackSessionToken, event.sender.id);
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

  // 10. 独立置顶摸鱼小窗 (PiP) 与窗口控制
  ipcMain.handle('window:openPiP', async (event) => {
    assertSender(event);
    return await windowManager.openPiPWindow();
  });

  ipcMain.handle('window:closePiP', async (event) => {
    assertSender(event);
    return await windowManager.closePiPWindow();
  });

  ipcMain.handle('window:isPiPActive', async (event) => {
    assertSender(event);
    return windowManager.isPiPActive();
  });

  ipcMain.handle('window:ackPiPReady', async (event) => {
    assertSender(event);
    return windowManager.handleAckPiPReady(event.sender.id);
  });

  ipcMain.handle('window:ackSourcePaused', async (event, positionSeconds: unknown) => {
    assertSender(event);
    const pos = typeof positionSeconds === 'number' && Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
    return await windowManager.handleAckSourcePaused(event.sender.id, pos);
  });

  ipcMain.handle('window:ackTargetPlaying', async (event, token: unknown) => {
    assertSender(event);
    if (!token || typeof token !== 'object') return false;
    return windowManager.handleAckTargetPlaying(event.sender.id, token as PlaybackSessionToken);
  });

  ipcMain.handle('window:ackAwaitingUserGesture', async (event, token: unknown) => {
    assertSender(event);
    if (!token || typeof token !== 'object') return false;
    return windowManager.handleAckAwaitingUserGesture(event.sender.id, token as PlaybackSessionToken);
  });

  ipcMain.handle('window:reportPiPPlaybackError', async (event, _token: unknown, error: unknown) => {
    assertSender(event);
    const errMsg = typeof error === 'string' ? error.slice(0, 500) : 'Unknown playback error';
    return windowManager.handleReportPiPPlaybackError(event.sender.id, errMsg);
  });

  ipcMain.handle('window:toggleAlwaysOnTop', async (event) => {
    assertSender(event);
    const mainWin = windowManager.getMainWindow();
    if (!mainWin) return false;
    const current = mainWin.isAlwaysOnTop();
    mainWin.setAlwaysOnTop(!current);
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
  const mainWindow = windowManager.createMainWindow();
  setupSystemTray(() => windowManager.getMainWindow());

  // 自动化 GUI 冒烟测试模式 (验证 BrowserWindow 启动、Preload 注入与全业务 IPC 往返)
  if (process.env.OHG_SMOKE_TEST === '1' && mainWindow) {
    const smokeTimeout = setTimeout(() => {
      console.error('[Smoke] Timeout waiting for did-finish-load');
      process.exit(1);
    }, 15000);

    mainWindow.webContents.on('did-finish-load', async () => {
      clearTimeout(smokeTimeout);
      console.log('[Smoke] Window loaded index.html successfully!');

      // 验证底层 Wasm SDK 在真实环境下的初始化能力 (加载解包后的 openhongguo.wasm)
      try {
        const wasmOk = await sdkAdapter.verifyWasmRuntime();
        if (!wasmOk) throw new Error('Wasm SDK failed to instantiate getSeries');
        console.log('[Smoke] Verified real Openhongguo Wasm client instantiated successfully in runtime environment!');
      } catch (wasmErr: any) {
        console.error('[Smoke] Failed to verify Wasm runtime:', wasmErr);
        mainWindow?.destroy();
        app.quit();
        process.exit(1);
      }

      try {
        const isRestoreMode = process.env.OHG_VERIFY_RESTORE === '1';
        const testScript = `(async () => {
          try {
          if (!window.electronAPI) throw new Error('window.electronAPI not exposed in renderer frame');

          if (${isRestoreMode}) {
            const restoredHistory = await window.electronAPI.getHistory();
            if (restoredHistory.length === 0 || restoredHistory[0].seriesId !== 'mock_series_1') {
              throw new Error('History did not persist across packaged app process restart');
            }
            const restoredFavorites = await window.electronAPI.getFavorites();
            if (restoredFavorites.length === 0 || restoredFavorites[0].seriesId !== 'mock_series_1') {
              throw new Error('Favorites did not persist across packaged app process restart');
            }
            return {
              restoreVerified: true,
              historyCount: restoredHistory.length,
              favoritesCount: restoredFavorites.length,
            };
          }

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
            positionSeconds: 1.5,
            durationSeconds: 7.8,
            progressPercentage: 19,
            updatedAt: Date.now(),
          });
          const history = await window.electronAPI.getHistory();
          if (history.length === 0 || history[0].seriesId !== 'mock_series_1') {
            throw new Error('History persistence over IPC failed');
          }

          await window.electronAPI.toggleFavorite({
            seriesId: 'mock_series_1',
            title: '测试精选短剧1',
            coverUrl: 'https://example.com/cover1.jpg',
            addedAt: Date.now(),
          });
          const favorites = await window.electronAPI.getFavorites();
          if (favorites.length === 0 || favorites[0].seriesId !== 'mock_series_1') {
            throw new Error('Favorite persistence over IPC failed');
          }

          // 5. 真实本地 WebM 媒体解析、出帧开播、单窗口发声与 PiP 双向接力实测
          const source = await window.electronAPI.resolvePlaybackSource('ep_1');
          if (!source || !source.streams || source.streams.length === 0) throw new Error('resolvePlaybackSource failed');
          const streamUrl = source.streams[0].url;

          // 创建 DOM 视频元素并挂载，验证真实 HTML5 video 渲染管道
          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.src = streamUrl;
          video.currentTime = 1.0;
          document.body.appendChild(video);

          let playingFired = false;
          video.addEventListener('playing', () => { playingFired = true; }, { once: true });

          const token = await window.electronAPI.startSession({
            seriesId: 'mock_series_1',
            seriesTitle: '测试精选短剧1',
            episodeId: 'ep_1',
            episodeNumber: 1,
            episodeTitle: '第1集',
            positionSeconds: 1.0,
            durationSeconds: 7.8,
          });
          if (!token || !token.sessionId) throw new Error('startSession must return a valid session token');

          await video.play();
          // 等待视频实际出帧开播
          for (let i = 0; i < 30; i++) {
            if (playingFired && !video.paused && video.currentTime > 1.02) break;
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!playingFired) throw new Error('MainWindow video did not fire playing event');
          if (video.paused) throw new Error('MainWindow video paused unexpectedly');
          if (video.currentTime <= 1.0) throw new Error('MainWindow video currentTime did not advance');

          await window.electronAPI.updateSessionStatus(token, 'playing');
          await window.electronAPI.updateSessionProgress(token, {
            positionSeconds: video.currentTime,
            durationSeconds: 7.8,
          });

          // 注册源窗口接力事件监听器 (单发声屏障：暂停源窗口并反馈进度)
          let sourcePausedTriggered = false;
          const unsubHandoffTo = window.electronAPI.onHandoffToPiP(async () => {
            video.pause();
            sourcePausedTriggered = true;
            await window.electronAPI.ackSourcePaused(video.currentTime);
          });

          let restoredFromPiP = false;
          let restoredPosition = 0;
          const unsubHandoffFrom = window.electronAPI.onHandoffFromPiP(async ({ newToken, session }) => {
            restoredFromPiP = true;
            restoredPosition = session.positionSeconds;
            video.currentTime = restoredPosition;
            await video.play().catch(() => {});
          });

          // 验证独立置顶摸鱼小窗 (PiP) 双窗口创建与会话所有权移交 (必须目标出帧开播确认后才返回 true)
          const pipOpened = await window.electronAPI.openPiPWindow();
          if (!pipOpened) throw new Error('openPiPWindow failed to achieve target playing ack');
          if (!sourcePausedTriggered) throw new Error('Source window onHandoffToPiP was not triggered');
          if (!video.paused) throw new Error('Source window must be paused during PiP handoff to protect single-audio barrier');

          const isPiPActive1 = await window.electronAPI.isPiPActive();
          if (!isPiPActive1) throw new Error('isPiPActive must be true after opening PiP');

          const currSession1 = await window.electronAPI.getCurrentSession();
          if (!currSession1 || currSession1.token.ownerWindowId === token.ownerWindowId) {
            throw new Error('PlaybackSessionToken ownership must be transferred to PiP window');
          }

          // 验证独立小窗安全关闭与会话回退移交
          const pipClosed = await window.electronAPI.closePiPWindow();
          if (!pipClosed) throw new Error('closePiPWindow failed');

          for (let i = 0; i < 30; i++) {
            if (restoredFromPiP) break;
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!restoredFromPiP) throw new Error('MainWindow did not receive onHandoffFromPiP event on PiP close');

          const isPiPActive2 = await window.electronAPI.isPiPActive();
          if (isPiPActive2) throw new Error('isPiPActive must be false after closing PiP');

          const currSession2 = await window.electronAPI.getCurrentSession();
          if (!currSession2 || currSession2.token.ownerWindowId !== token.ownerWindowId) {
            throw new Error('PlaybackSessionToken ownership must be transferred back to MainWindow');
          }
          if (restoredPosition < 1.0) {
            throw new Error('Playback position corrupted during PiP roundtrip');
          }

          // 清理监听器与 DOM 视频元素
          unsubHandoffTo();
          unsubHandoffFrom();
          video.pause();
          video.remove();
          const closedOk = await window.electronAPI.closeSession(currSession2.token);
          const sessionAfterClose = await window.electronAPI.getCurrentSession();
          if (sessionAfterClose !== null) {
            throw new Error('Session still exists after closeSession: closedOk=' + closedOk + ', sess=' + JSON.stringify(sessionAfterClose));
          }

          // 验证无活跃会话时打开小窗安全回滚返回 false
          const badOpen = await window.electronAPI.openPiPWindow();
          if (badOpen) throw new Error('openPiPWindow must return false when no active session exists');

          return {
            diagPlatform: diag.platform,
            discoverCount: discover.items.length,
            episodesCount: episodes.items.length,
            historyCount: history.length,
            playbackStreams: source.streams.length,
            pipVerified: true,
          };
        } catch (e) {
          return { error: e.message || String(e), stack: e.stack };
        }
        })()`;

        const smokeResult = await mainWindow!.webContents.executeJavaScript(testScript);
        if (smokeResult?.error) {
          throw new Error(smokeResult.error + '\n' + smokeResult.stack);
        }
        console.log('[Smoke] Successfully verified full business IPC & ContextBridge pipeline in real window:', smokeResult);

        mainWindow?.destroy();
        app.quit();
        process.exit(0);
      } catch (err: any) {
        console.error('[Smoke] Failure in renderer context:', err?.message || err, err?.stack);
        mainWindow?.destroy();
        app.quit();
        process.exit(1);
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  // 严格顺序协调：先提交活跃会话的最终断点，再安全刷写持久层并关闭
  playbackCoordinator.closeSessionSync();
  dataStore.closeSync();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
