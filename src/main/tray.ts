import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, Tray as TrayType } from 'electron';

const { app, Menu, Tray, nativeImage } = electron;

let tray: TrayType | null = null;

// 16x16 红色简约短剧播放图标 DataURL (透明背景红色播放三角形)
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAExJREFUOE9jZKAQMOLB/xkYGBj+ExIMUDBqAIlG41MwGkBgGEAQI/m3AWRbAAnjVzDqgEFrAE7g40uD0QAGowEEXo5i6mUAAL86FQszuGj/AAAAAElFTkSuQmCC';

export function setupSystemTray(mainWindow: BrowserWindowType): TrayType {
  if (tray) return tray;

  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  tray = new Tray(icon);
  tray.setToolTip('Oh-My-Hongguo · 红果短剧');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏主窗口',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '置顶摸鱼模式 (切换)',
      click: () => {
        const current = mainWindow.isAlwaysOnTop();
        mainWindow.setAlwaysOnTop(!current);
      },
    },
    { type: 'separator' },
    {
      label: '退出 OhMyHongguo',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}
