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

  // 2. 独立置顶摸鱼小窗 (PiP) 创建与会话接力
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

    // 将播放会话所有权原子移交至小窗 WebContents ID
    const newToken = playbackCoordinator.transferOwnership(pip.webContents.id);
    if (!newToken) {
      pip.destroy();
      return false;
    }

    // 主窗口切换为“小窗接力中”状态并静音/停止发声
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('playback:handoff-to-pip', {
        newToken,
        session: currentSession,
      });
    }

    // 小窗加载页面
    const query = `?mode=pip&sessionId=${encodeURIComponent(newToken.sessionId)}`;
    if (process.env.VITE_DEV_SERVER_URL) {
      pip.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`);
    } else {
      pip.loadFile(path.join(__dirname, '../dist/index.html'), { search: query });
    }

    pip.on('closed', () => {
      this.pipWindow = null;
      // 小窗关闭时，若主窗口存活，将所有权迁回主窗口
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

  // 3. 关闭小窗并将所有权交还主窗口
  public async closePiPWindow(): Promise<boolean> {
    if (!this.pipWindow || this.pipWindow.isDestroyed()) {
      return false;
    }
    this.pipWindow.close();
    this.pipWindow = null;
    return true;
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
