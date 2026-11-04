import type { IElectronAPI } from '../shared/types.js';

// Preload 脚本在沙箱环境中通过 CommonJS require('electron') 访问原生 contextBridge 与 ipcRenderer
const electron = require('electron');
const { contextBridge, ipcRenderer } = electron;

const api: IElectronAPI = {
  getDiscover: (options) => ipcRenderer.invoke('sdk:getDiscover', options),
  searchDramas: (query, options) => ipcRenderer.invoke('sdk:searchDramas', query, options),
  getSearchSuggestions: (prefix) => ipcRenderer.invoke('sdk:getSearchSuggestions', prefix),
  getHotSearch: () => ipcRenderer.invoke('sdk:getHotSearch'),
  getDramaDetail: (seriesId) => ipcRenderer.invoke('sdk:getDramaDetail', seriesId),
  getEpisodes: (seriesId, options) => ipcRenderer.invoke('sdk:getEpisodes', seriesId, options),
  getShortRank: (options) => ipcRenderer.invoke('sdk:getShortRank', options),

  resolvePlaybackSource: (episodeId) => ipcRenderer.invoke('sdk:resolvePlaybackSource', episodeId),
  startSession: (session) => ipcRenderer.invoke('playback:startSession', session),
  updateSessionStatus: (token, status, errorMessage) =>
    ipcRenderer.invoke('playback:updateStatus', token, status, errorMessage),
  updateSessionProgress: (token, progress) =>
    ipcRenderer.invoke('playback:updateProgress', token, progress),
  getCurrentSession: () => ipcRenderer.invoke('playback:getCurrentSession'),
  closeSession: (token) => ipcRenderer.invoke('playback:closeSession', token),

  // 独立置顶摸鱼小窗 (PiP)
  openPiPWindow: () => ipcRenderer.invoke('window:openPiP'),
  closePiPWindow: () => ipcRenderer.invoke('window:closePiP'),
  isPiPActive: () => ipcRenderer.invoke('window:isPiPActive'),
  ackSourcePaused: (positionSeconds) => ipcRenderer.invoke('window:ackSourcePaused', positionSeconds),
  ackPiPReady: () => ipcRenderer.invoke('window:ackPiPReady'),
  ackTargetPlaying: (token) => ipcRenderer.invoke('window:ackTargetPlaying', token),
  reportPiPPlaybackError: (token, error) => ipcRenderer.invoke('window:reportPiPPlaybackError', token, error),
  onHandoffToPiP: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('playback:handoff-to-pip', handler);
    return () => {
      ipcRenderer.removeListener('playback:handoff-to-pip', handler);
    };
  },
  onHandoffFromPiP: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('playback:handoff-from-pip', handler);
    return () => {
      ipcRenderer.removeListener('playback:handoff-from-pip', handler);
    };
  },
  onHandoffCommit: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('playback:handoff-commit', handler);
    return () => {
      ipcRenderer.removeListener('playback:handoff-commit', handler);
    };
  },

  getHistory: () => ipcRenderer.invoke('store:getHistory'),
  saveHistory: (item) => ipcRenderer.invoke('store:saveHistory', item),
  clearHistory: () => ipcRenderer.invoke('store:clearHistory'),
  getFavorites: () => ipcRenderer.invoke('store:getFavorites'),
  toggleFavorite: (item) => ipcRenderer.invoke('store:toggleFavorite', item),

  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  getDiagnostics: () => ipcRenderer.invoke('system:getDiagnostics'),
  onWindowStateChange: (callback) => {
    const handler = (_: any, state: any) => callback(state);
    ipcRenderer.on('window:stateChange', handler);
    return () => {
      ipcRenderer.removeListener('window:stateChange', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
