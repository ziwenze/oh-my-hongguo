/**
 * Oh-My-Hongguo 跨进程共享数据契约与 IPC 类型定义
 */

// 短剧简要信息
export interface DramaSummary {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  coverExpiresAt?: string; // RFC 3339 字符串
  episodeCount: number;
  author?: string;
  category?: string;
  heat?: number;
  statusText?: string; // "全80集" 或 "更新至12集"
}

// 分集详细信息
export interface EpisodeItem {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  playable: boolean;
  isNew: boolean;
  coverUrl?: string;
  coverExpiresAt?: string;
}

// 分页结构
export interface PageResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

// 观看历史持久化模型
export interface WatchHistoryItem {
  seriesId: string;
  seriesTitle: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  positionSeconds: number; // 浮点数，秒级断点
  durationSeconds: number;
  progressPercentage: number;
  updatedAt: number; // 毫秒时间戳
  cachedCoverUrl?: string;
  cachedCoverExpiresAt?: string;
}

// 追剧收藏持久化模型
export interface FavoriteItem {
  seriesId: string;
  seriesTitle: string;
  cachedCoverUrl?: string;
  cachedCoverExpiresAt?: string;
  episodeCount: number;
  addedAt: number;
}

// 播放选路模型 (渲染层接收)
export interface PlaybackMediaSource {
  episodeId: string;
  seriesId: string;
  episodeNumber: number;
  protected: boolean;
  durationSeconds: number;
  expiresAt: number; // Unix 秒数时间戳
  streams: {
    definition: string;
    quality?: string;
    codec?: string;
    url: string;
    backupUrl?: string;
    protected: boolean;
    encryption?: string;
  }[];
  audioUrl?: string;
}

// 播放状态枚举
export type PlaybackStatus = 'idle' | 'resolving' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

// 播放会话所有权凭证 (跨窗口与跨分集隔离)
export interface PlaybackSessionToken {
  sessionId: string;
  generation: number;
  ownerWindowId: number;
}

// 活跃播放会话模型
export interface PlaybackSessionState {
  token: PlaybackSessionToken;
  seriesId: string;
  seriesTitle: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  positionSeconds: number;
  durationSeconds: number;
  status: PlaybackStatus;
  errorMessage?: string;
  expiresAt?: number;
}

// 搜索联想条目
export interface SearchSuggestionItem {
  text: string;
  keyword?: string;
}

// 榜单短剧条目
export interface RankDramaItem {
  rank: number;
  seriesId: string;
  title: string;
  coverUrl: string;
  score?: string;
  actor?: string;
  episodeCount?: number;
  description?: string;
}

// 客户端系统与诊断信息
export interface SystemDiagnostics {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  profilePath: string;
  deviceId?: string;
}

// 预加载暴露在 window.electronAPI 上的强类型 API 接口
export interface IElectronAPI {
  // 元数据浏览
  getDiscover(options?: { channel?: string; cursor?: string }): Promise<PageResult<DramaSummary>>;
  searchDramas(query: string, options?: { cursor?: string }): Promise<PageResult<DramaSummary>>;
  getSearchSuggestions(prefix: string): Promise<SearchSuggestionItem[]>;
  getHotSearch(): Promise<{ hotQueries: string[]; searchCues: string[] }>;
  getDramaDetail(seriesId: string): Promise<DramaSummary | null>;
  getEpisodes(seriesId: string, options?: { cursor?: string; pageSize?: number }): Promise<PageResult<EpisodeItem>>;
  getShortRank(options?: { content?: string; board?: string; cursor?: string }): Promise<PageResult<RankDramaItem>>;

  // 播放协调 (支持会话身份隔离与窗口所有权)
  resolvePlaybackSource(episodeId: string): Promise<PlaybackMediaSource>;
  startSession(session: {
    seriesId: string;
    seriesTitle: string;
    episodeId: string;
    episodeNumber: number;
    episodeTitle: string;
    positionSeconds?: number;
    durationSeconds?: number;
  }): Promise<PlaybackSessionToken>;
  updateSessionStatus(token: PlaybackSessionToken, status: PlaybackStatus, errorMessage?: string): Promise<boolean>;
  updateSessionProgress(
    token: PlaybackSessionToken,
    progress: { positionSeconds: number; durationSeconds?: number }
  ): Promise<boolean>;
  getCurrentSession(): Promise<PlaybackSessionState | null>;
  closeSession(token?: PlaybackSessionToken): Promise<boolean>;

  // 独立置顶摸鱼小窗 (PiP) 与双向握手接力
  openPiPWindow(): Promise<boolean>;
  closePiPWindow(): Promise<boolean>;
  isPiPActive(): Promise<boolean>;
  ackSourcePaused(positionSeconds: number): Promise<boolean>;
  ackPiPReady(): Promise<boolean>;
  ackTargetPlaying(token: PlaybackSessionToken): Promise<boolean>;
  ackAwaitingUserGesture(token: PlaybackSessionToken): Promise<boolean>;
  reportPiPPlaybackError(token: PlaybackSessionToken, error: string): Promise<boolean>;
  onHandoffToPiP(
    callback: (data: { session: PlaybackSessionState }) => void
  ): () => void;
  onHandoffFromPiP(
    callback: (data: { newToken: PlaybackSessionToken; session: PlaybackSessionState }) => void
  ): () => void;
  onHandoffCommit(
    callback: (data: { newToken: PlaybackSessionToken; session: PlaybackSessionState }) => void
  ): () => void;

  // 本地持久化 (历史记录与收藏)
  getHistory(): Promise<WatchHistoryItem[]>;
  saveHistory(item: WatchHistoryItem): Promise<void>;
  clearHistory(): Promise<void>;
  getFavorites(): Promise<FavoriteItem[]>;
  toggleFavorite(item: FavoriteItem): Promise<boolean>;

  // 窗口与诊断
  toggleAlwaysOnTop(): Promise<boolean>;
  getDiagnostics(): Promise<SystemDiagnostics>;
  openExternal(url: string): Promise<boolean>;
  onWindowStateChange(callback: (state: { isMaximized: boolean; isAlwaysOnTop: boolean }) => void): () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
