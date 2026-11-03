import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdkAdapter } from './sdk/adapter.js';
import { dataStore } from './store/dataStore.js';
import type { SystemDiagnostics } from '../shared/types.js';

const { app, BrowserWindow, ipcMain, shell } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    title: 'Oh-My-Hongguo · 红果短剧',
    backgroundColor: '#0d0f12',
    titleBarStyle: 'hiddenInset', // macOS 原生磨砂胶囊风格
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外部链接一律用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 开发模式加载 Vite 本地服务，生产模式加载静态 dist
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 注册 IPC 调度
function registerIpcHandlers() {
  // SDK 元数据
  ipcMain.handle('sdk:getDiscover', async (_, options) => {
    return await sdkAdapter.getDiscover(options);
  });

  ipcMain.handle('sdk:searchDramas', async (_, query, options) => {
    return await sdkAdapter.search(query, options);
  });

  ipcMain.handle('sdk:getSearchSuggestions', async (_, prefix) => {
    return await sdkAdapter.suggest(prefix);
  });

  ipcMain.handle('sdk:getHotSearch', async () => {
    return await sdkAdapter.getHotSearch();
  });

  ipcMain.handle('sdk:getDramaDetail', async (_, seriesId) => {
    return await sdkAdapter.getSeriesDetail(seriesId);
  });

  ipcMain.handle('sdk:getEpisodes', async (_, seriesId, options) => {
    return await sdkAdapter.listEpisodes(seriesId, options);
  });

  ipcMain.handle('sdk:resolvePlaybackSource', async (_, episodeId) => {
    return await sdkAdapter.resolvePlayback(episodeId);
  });

  // 本地数据存储
  ipcMain.handle('store:getHistory', async () => {
    return await dataStore.getHistory();
  });

  ipcMain.handle('store:saveHistory', async (_, item) => {
    return await dataStore.saveHistory(item);
  });

  ipcMain.handle('store:clearHistory', async () => {
    return await dataStore.clearHistory();
  });

  ipcMain.handle('store:getFavorites', async () => {
    return await dataStore.getFavorites();
  });

  ipcMain.handle('store:toggleFavorite', async (_, item) => {
    return await dataStore.toggleFavorite(item);
  });

  // 窗口与诊断
  ipcMain.handle('window:toggleAlwaysOnTop', async () => {
    if (!mainWindow) return false;
    const current = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!current);
    return !current;
  });

  ipcMain.handle('system:getDiagnostics', async (): Promise<SystemDiagnostics> => {
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
