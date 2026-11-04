import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, HandlerDetails } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playbackCoordinator } from '../session/coordinator.ts';
import type { PlaybackSessionToken } from '../../shared/types.ts';

const { BrowserWindow, shell } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WindowManager {
  private mainWindow: BrowserWindowType | null = null;
  private pipWindow: BrowserWindowType | null = null;
  private prodDistUrl: string;
  private pipReadyResolver: ((ready: boolean) => void) | null = null;
  private sourcePausedResolver: ((pos: number) => void) | null = null;
  private targetPlayingResolver: ((result: 'target_playing' | 'awaiting_gesture' | false) => void) | null = null;
  private openPiPPromise: Promise<boolean> | null = null;

  constructor(prodDistUrl: string) {
    this.prodDistUrl = prodDistUrl;
  }

  public getMainWindow(): BrowserWindowType | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null;
  }

  public getPiPWindow(): BrowserWindowType | null {
    return this.pipWindow && !this.pipWindow.isDestroyed() ? this.pipWindow : null;
  }

  public isPiPActive(): boolean {
    return Boolean(this.pipWindow && !this.pipWindow.isDestroyed() && this.pipWindow.isVisible());
  }

  // 1. 创建或聚焦主窗口
  public createMainWindow(): BrowserWindowType {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
      return this.mainWindow;
    }

    const win = new BrowserWindow({
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

    this.setupWindowSecurity(win);

    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    win.on('closed', () => {
      this.mainWindow = null;
      // 若主窗口关闭且小窗存在，关闭小窗
      if (this.pipWindow && !this.pipWindow.isDestroyed()) {
        this.pipWindow.close();
      }
    });

    this.mainWindow = win;
    return win;
  }

  // 2. 独立置顶摸鱼小窗 (PiP) 创建与安全握手接力 (Prepare -> Commit -> Ack / Rollback)
  public openPiPWindow(): Promise<boolean> {
    // 事务防重入：若已有打开操作在途，复用同一笔接力 Promise，杜绝重复创建并发竞争
    if (this.openPiPPromise) {
      return this.openPiPPromise;
    }
    this.openPiPPromise = this.executeOpenPiPWindow().finally(() => {
      this.openPiPPromise = null;
    });
    return this.openPiPPromise;
  }

  private async executeOpenPiPWindow(): Promise<boolean> {
    const currentSession = playbackCoordinator.getCurrentSession();
    if (!currentSession) {
      return false; // 无活跃播放会话时不能移交小窗
    }

    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.show();
      this.pipWindow.focus();
      return true;
    }

    // 阶段 1 (Prepare): 创建独立小窗，保持原主窗口所有权，预加载页面
    const pip = new BrowserWindow({
      width: 300,
      height: 533, // 9:16 画幅
      minWidth: 220,
      minHeight: 391,
      alwaysOnTop: true,
      backgroundColor: '#000000',
      title: '正在小窗播放中',
      frame: false,
      resizable: true,
      skipTaskbar: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.setupWindowSecurity(pip);
    this.pipWindow = pip;
    const pipWindowId = pip.webContents.id;

    // 关键架构守卫：小窗创建即刻注册 closed 监听，防止接力途中异常退出导致孤儿会话或事件丢失
    pip.on('closed', () => {
      this.pipWindow = null;
      if (this.sourcePausedResolver) {
        this.sourcePausedResolver(0);
        this.sourcePausedResolver = null;
      }
      if (this.pipReadyResolver) {
        this.pipReadyResolver(false);
        this.pipReadyResolver = null;
      }
      if (this.targetPlayingResolver) {
        this.targetPlayingResolver(false);
        this.targetPlayingResolver = null;
      }
      // 小窗关闭时，若主窗口存活且会话归小窗所有，对称移交所有权回主窗口并通知恢复续播
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const sess = playbackCoordinator.getCurrentSession();
        if (sess && sess.token.ownerWindowId === pipWindowId) {
          const returnToken = playbackCoordinator.transferOwnership(this.mainWindow.webContents.id);
          if (returnToken) {
            this.mainWindow.webContents.send('playback:handoff-from-pip', {
              newToken: returnToken,
              session: playbackCoordinator.getCurrentSession(),
            });
          }
        }
      }
    });

    // 握手屏障 1: 单窗口发声保护，先通知主窗口暂停发声并等待确认
    const isSourcePlaying = currentSession.status === 'playing';
    let sourcePausedTimer: NodeJS.Timeout | null = null;
    const sourcePausedPromise = new Promise<boolean>((resolve) => {
      this.sourcePausedResolver = () => {
        if (sourcePausedTimer) clearTimeout(sourcePausedTimer);
        resolve(true);
      };
      sourcePausedTimer = setTimeout(() => {
        if (isSourcePlaying) {
          console.warn('[WindowManager] Source window paused ack timed out while playing, triggering rollback');
          resolve(false); // 严格回滚！发声状态下未收到暂停确认，禁止接力，保障单发声屏障
        } else {
          resolve(true); // 非发声状态允许继续
        }
      }, 3000);
    });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('playback:handoff-to-pip', {
        session: currentSession,
      });
    }

    // 握手屏障 2: 建立 PiP 渲染帧 Ack 等待屏障 (超时 5 秒自动回滚)
    let readyTimer: NodeJS.Timeout | null = null;
    const readyPromise = new Promise<boolean>((resolve) => {
      this.pipReadyResolver = (ready) => {
        if (readyTimer) clearTimeout(readyTimer);
        resolve(ready);
      };
      readyTimer = setTimeout(() => {
        console.warn('[WindowManager] PiP ready handshake timed out, triggering rollback');
        resolve(false);
      }, 5000);
    });

    const queryString = `mode=pip&sessionId=${encodeURIComponent(currentSession.token.sessionId)}`;
    const loadPromise = process.env.VITE_DEV_SERVER_URL
      ? pip.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${queryString}`)
      : pip.loadFile(path.join(__dirname, '../dist/index.html'), { search: queryString });

    try {
      const isSourcePaused = await sourcePausedPromise;
      if (!isSourcePaused) {
        throw new Error('Source window failed to confirm pausing within timeout, aborting handoff to protect single-audio barrier');
      }
      await loadPromise;
      const isReady = await readyPromise;
      if (!isReady || pip.isDestroyed()) {
        throw new Error('PiP window not ready or destroyed before commit');
      }
    } catch (err) {
      // 阶段 3 (Rollback): 握手或加载失败，立即销毁小窗并通知主窗口恢复会话
      console.warn('[WindowManager] PiP handoff failed, rolling back to main window:', err);
      if (!pip.isDestroyed()) pip.destroy();
      this.pipWindow = null;
      this.pipReadyResolver = null;
      this.sourcePausedResolver = null;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('playback:handoff-from-pip', {
          newToken: currentSession.token,
          session: currentSession,
        });
      }
      return false;
    }

    // 阶段 2 (Commit): 源窗口已暂停且小窗渲染器 Ack 确认就绪后，原子移交所有权并签发新 Token
    const newToken = playbackCoordinator.transferOwnership(pip.webContents.id);
    if (!newToken) {
      pip.destroy();
      this.pipWindow = null;
      return false;
    }

    // 建立目标小窗出帧开播 Ack 监听屏障 (超时 3 秒严格回滚，无假成功)
    let targetPlayingTimer: NodeJS.Timeout | null = null;
    const targetPlayingPromise = new Promise<'target_playing' | 'awaiting_gesture' | false>((resolve) => {
      this.targetPlayingResolver = (res) => {
        if (targetPlayingTimer) clearTimeout(targetPlayingTimer);
        resolve(res);
      };
      targetPlayingTimer = setTimeout(() => {
        console.warn('[WindowManager] PiP target playing timed out after 3000ms, triggering rollback');
        resolve(false); // 严格回滚！超时坚决失败
      }, 3000);
    });

    // 将 Commit 消息与新 Token 分发给小窗渲染帧，触发开播
    pip.webContents.send('playback:handoff-commit', {
      newToken,
      session: playbackCoordinator.getCurrentSession(),
    });

    const targetResult = await targetPlayingPromise;
    this.targetPlayingResolver = null;

    if (!targetResult || !this.pipWindow || this.pipWindow.isDestroyed()) {
      // 目标开播超时或失败，执行事务失败回滚
      console.warn('[WindowManager] PiP target playback failed or timed out, rolling back to main window');
      if (this.pipWindow && !this.pipWindow.isDestroyed()) {
        this.pipWindow.destroy();
      }
      this.pipWindow = null;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const returnToken = playbackCoordinator.transferOwnership(this.mainWindow.webContents.id);
        if (returnToken) {
          this.mainWindow.webContents.send('playback:handoff-from-pip', {
            newToken: returnToken,
            session: playbackCoordinator.getCurrentSession(),
          });
        }
      }
      return false;
    }

    return true;
  }

  // 接收源窗口暂停并提交最新断点的确认
  public async handleAckSourcePaused(callerWindowId: number, positionSeconds: number): Promise<boolean> {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.id === callerWindowId) {
      const sess = playbackCoordinator.getCurrentSession();
      if (sess) {
        // 先确保暂停位置被协调器正式接受落盘
        await playbackCoordinator.updateProgress(sess.token, { positionSeconds }, callerWindowId);
      }
      if (this.sourcePausedResolver) {
        this.sourcePausedResolver(positionSeconds);
        this.sourcePausedResolver = null;
        return true;
      }
    }
    return false;
  }

  // 接收小窗渲染帧发出的 Ack 握手确认
  public handleAckPiPReady(callerWindowId: number): boolean {
    if (this.pipWindow && !this.pipWindow.isDestroyed() && this.pipWindow.webContents.id === callerWindowId) {
      if (this.pipReadyResolver) {
        this.pipReadyResolver(true);
        this.pipReadyResolver = null;
        return true;
      }
    }
    return false;
  }

  // 接收小窗真正出帧开播的 Ack 确认，完成整笔接力事务闭环
  public handleAckTargetPlaying(callerWindowId: number, token: PlaybackSessionToken): boolean {
    if (this.pipWindow && !this.pipWindow.isDestroyed() && this.pipWindow.webContents.id === callerWindowId) {
      if (playbackCoordinator.validateToken(token, callerWindowId)) {
        if (this.targetPlayingResolver) {
          this.targetPlayingResolver('target_playing');
          this.targetPlayingResolver = null;
        }
        return true;
      }
    }
    return false;
  }

  // 接收小窗自动播放受限处于等待用户手势确认 (保留小窗，但协调器状态保持非 playing)
  public handleAckAwaitingUserGesture(callerWindowId: number, token: PlaybackSessionToken): boolean {
    if (this.pipWindow && !this.pipWindow.isDestroyed() && this.pipWindow.webContents.id === callerWindowId) {
      if (playbackCoordinator.validateToken(token, callerWindowId)) {
        if (this.targetPlayingResolver) {
          this.targetPlayingResolver('awaiting_gesture');
          this.targetPlayingResolver = null;
        }
        return true;
      }
    }
    return false;
  }

  // 小窗解码或流异常上报，触发主进程统一回滚
  public handleReportPiPPlaybackError(callerWindowId: number, error: string): boolean {
    if (this.pipWindow && !this.pipWindow.isDestroyed() && this.pipWindow.webContents.id === callerWindowId) {
      console.warn('[WindowManager] PiP reported playback failure, rolling back to main window:', error);
      if (this.targetPlayingResolver) {
        this.targetPlayingResolver(false);
        this.targetPlayingResolver = null;
      }
      if (this.pipReadyResolver) {
        this.pipReadyResolver(false);
        this.pipReadyResolver = null;
      }
      this.closePiPWindow();
      return true;
    }
    return false;
  }

  // 3. 关闭小窗并将所有权交还主窗口
  public async closePiPWindow(): Promise<boolean> {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) {
      return false;
    }
    this.pipWindow.close();
    this.pipWindow = null;
    return true;
  }

  // 4. 窗口新会话所有权收回：若非小窗启动新会话，主动销毁小窗确保单一窗口发声
  public onSessionStartedByWindow(callerWindowId: number): void {
    if (
      this.pipWindow &&
      !this.pipWindow.isDestroyed() &&
      this.pipWindow.webContents.id !== callerWindowId
    ) {
      this.pipWindow.close();
      this.pipWindow = null;
    }
  }

  // 安全配置
  private setupWindowSecurity(win: BrowserWindowType): void {
    win.webContents.setWindowOpenHandler((details: HandlerDetails) => {
      const targetUrl = details.url;
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          shell.openExternal(targetUrl).catch(() => {});
        }
      } catch {
        // 忽略
      }
      return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event: Electron.Event, navigationUrl: string) => {
      let isAllowed = false;
      try {
        if (process.env.VITE_DEV_SERVER_URL) {
          const allowedOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin;
          isAllowed = new URL(navigationUrl).origin === allowedOrigin;
        } else {
          isAllowed = navigationUrl.startsWith(this.prodDistUrl);
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
  }
}
