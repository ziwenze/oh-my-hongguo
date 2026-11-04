import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, HandlerDetails } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playbackCoordinator } from '../session/coordinator.ts';

const { BrowserWindow, shell } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WindowManager {
  private mainWindow: BrowserWindowType | null = null;
  private pipWindow: BrowserWindowType | null = null;
  private prodDistUrl: string;
  private pipReadyResolver: (() => void) | null = null;

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
  public async openPiPWindow(): Promise<boolean> {
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

    // 握手屏障：单窗口发声保护，先通知主窗口暂停发声
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('playback:handoff-to-pip', {
        session: currentSession,
      });
    }

    // 建立 PiP 渲染帧 Ack 等待屏障 (超时 5 秒自动回滚)
    let readyTimer: NodeJS.Timeout | null = null;
    const readyPromise = new Promise<boolean>((resolve) => {
      this.pipReadyResolver = () => {
        if (readyTimer) clearTimeout(readyTimer);
        resolve(true);
      };
      readyTimer = setTimeout(() => {
        console.warn('[WindowManager] PiP ready handshake timed out, triggering rollback');
        resolve(false);
      }, 5000);
    });

    const query = `?mode=pip&sessionId=${encodeURIComponent(currentSession.token.sessionId)}`;
    const loadPromise = process.env.VITE_DEV_SERVER_URL
      ? pip.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`)
      : pip.loadFile(path.join(__dirname, '../dist/index.html'), { search: query });

    try {
      await loadPromise;
      const isReady = await readyPromise;
      if (!isReady || pip.isDestroyed()) {
        throw new Error('PiP window not ready or destroyed before commit');
      }
    } catch (err) {
      // 阶段 3 (Rollback): 握手或加载失败，立即销毁小窗并通知主窗口恢复会话
      console.warn('[WindowManager] PiP handoff failed, rolling back to main window:', err);
      if (!pip.isDestroyed()) pip.destroy();
      this.pipReadyResolver = null;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('playback:handoff-from-pip', {
          newToken: currentSession.token,
          session: currentSession,
        });
      }
      return false;
    }

    // 阶段 2 (Commit): 小窗渲染器 Ack 确认就绪后，原子移交所有权并签发新 Token
    const newToken = playbackCoordinator.transferOwnership(pip.webContents.id);
    if (!newToken) {
      pip.destroy();
      return false;
    }

    // 将 Commit 消息与新 Token 分发给小窗渲染帧，触发开播
    pip.webContents.send('playback:handoff-commit', {
      newToken,
      session: playbackCoordinator.getCurrentSession(),
    });

    pip.on('closed', () => {
      this.pipWindow = null;
      this.pipReadyResolver = null;
      // 小窗关闭时，若主窗口存活，对称移交所有权回主窗口并通知恢复续播
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const returnToken = playbackCoordinator.transferOwnership(this.mainWindow.webContents.id);
        if (returnToken) {
          this.mainWindow.webContents.send('playback:handoff-from-pip', {
            newToken: returnToken,
            session: playbackCoordinator.getCurrentSession(),
          });
        }
      }
    });

    this.pipWindow = pip;
    return true;
  }

  // 接收小窗渲染帧发出的 Ack 握手确认
  public handleAckPiPReady(callerWindowId: number): boolean {
    if (this.pipWindow && !this.pipWindow.isDestroyed() && this.pipWindow.webContents.id === callerWindowId) {
      if (this.pipReadyResolver) {
        this.pipReadyResolver();
        this.pipReadyResolver = null;
        return true;
      }
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
