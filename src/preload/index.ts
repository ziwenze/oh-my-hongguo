import electron from 'electron';
import type { IElectronAPI } from '../shared/types.js';

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
  updateSessionStatus: (status, errorMessage) => ipcRenderer.invoke('playback:updateStatus', status, errorMessage),
  updateSessionProgress: (progress) => ipcRenderer.invoke('playback:updateProgress', progress),
  getCurrentSession: () => ipcRenderer.invoke('playback:getCurrentSession'),
  closeSession: () => ipcRenderer.invoke('playback:closeSession'),

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
