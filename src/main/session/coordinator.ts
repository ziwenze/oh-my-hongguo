import { dataStore } from '../store/dataStore.ts';
import type { PlaybackSessionState, PlaybackStatus, WatchHistoryItem } from '../../shared/types.ts';

export interface IHistorySink {
  saveHistory(item: WatchHistoryItem): Promise<void>;
}

export class PlaybackSessionCoordinator {
  private store: IHistorySink;
  private currentSession: PlaybackSessionState | null = null;
  private lastSaveTimestamp = 0;
  private hasActuallyPlayed = false;
  private throttleMs: number;

  constructor(customStore?: IHistorySink, throttleMs = 3000) {
    this.store = customStore || dataStore;
    this.throttleMs = throttleMs;
  }

  public getCurrentSession(): PlaybackSessionState | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  // 1. 初始化会话 (状态置为 resolving，绝不提前写入虚假播放历史)
  public async startSession(initData: {
    seriesId: string;
    seriesTitle: string;
    episodeId: string;
    episodeNumber: number;
    episodeTitle: string;
    positionSeconds?: number;
    durationSeconds?: number;
  }): Promise<PlaybackSessionState> {
    const pos =
      typeof initData.positionSeconds === 'number' && Number.isFinite(initData.positionSeconds)
        ? Math.max(0, initData.positionSeconds)
        : 0;
    const dur =
      typeof initData.durationSeconds === 'number' && Number.isFinite(initData.durationSeconds)
        ? Math.max(0, initData.durationSeconds)
        : 0;

    this.hasActuallyPlayed = pos > 0;
    this.lastSaveTimestamp = 0;

    this.currentSession = {
      seriesId: initData.seriesId,
      seriesTitle: initData.seriesTitle,
      episodeId: initData.episodeId,
      episodeNumber: initData.episodeNumber,
      episodeTitle: initData.episodeTitle,
      positionSeconds: pos,
      durationSeconds: dur,
      status: 'resolving',
    };

    return { ...this.currentSession };
  }

  // 2. 状态机迁移 (仅在实际触发 playing/paused/ended 后才持久化历史)
  public async updateStatus(status: PlaybackStatus, errorMessage?: string): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.status = status;
    if (errorMessage) {
      this.currentSession.errorMessage = errorMessage;
    }

    if (status === 'playing') {
      this.hasActuallyPlayed = true;
      await this.syncToHistoryStore();
    } else if (status === 'paused' || status === 'ended') {
      if (this.hasActuallyPlayed) {
        await this.syncToHistoryStore();
      }
    }
  }

  // 3. 更新播放进度并节流写入历史
  public async updateProgress(progress: {
    positionSeconds: number;
    durationSeconds?: number;
  }): Promise<void> {
    if (!this.currentSession) return;

    const pos =
      typeof progress.positionSeconds === 'number' && Number.isFinite(progress.positionSeconds)
        ? Math.max(0, progress.positionSeconds)
        : this.currentSession.positionSeconds;
    const dur =
      typeof progress.durationSeconds === 'number' && Number.isFinite(progress.durationSeconds)
        ? Math.max(0, progress.durationSeconds)
        : this.currentSession.durationSeconds;

    this.currentSession.positionSeconds = pos;
    this.currentSession.durationSeconds = dur;

    // 严密约束：仅在会话处于实际 playing 状态或 ready 态且发生正向位移时，才认可为真实播放
    if (this.currentSession.status === 'playing' || (this.currentSession.status === 'ready' && pos > 0)) {
      this.hasActuallyPlayed = true;
    }

    // 只有在确已实际播放的情况下，才执行节流落盘，防止 resolving 或 error 态的虚假进度写入
    if (this.hasActuallyPlayed) {
      const now = Date.now();
      if (now - this.lastSaveTimestamp >= this.throttleMs) {
        this.lastSaveTimestamp = now;
        await this.syncToHistoryStore();
      }
    }
  }

  // 4. 结束会话并确保最终进度持久化
  public async closeSession(): Promise<void> {
    if (this.currentSession) {
      if (this.hasActuallyPlayed) {
        await this.syncToHistoryStore();
      }
      this.currentSession = null;
      this.hasActuallyPlayed = false;
    }
  }

  private async syncToHistoryStore(): Promise<void> {
    if (!this.currentSession) return;
    const { seriesId, seriesTitle, episodeId, episodeNumber, episodeTitle, positionSeconds, durationSeconds } =
      this.currentSession;

    const progressPercentage =
      durationSeconds > 0 ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100)) : 0;

    const historyItem: WatchHistoryItem = {
      seriesId,
      seriesTitle,
      episodeId,
      episodeNumber,
      episodeTitle,
      positionSeconds,
      durationSeconds,
      progressPercentage,
      updatedAt: Date.now(),
    };

    await this.store.saveHistory(historyItem).catch((err) => {
      console.warn('[Coordinator] Failed to sync history:', err);
    });
  }
}

export const playbackCoordinator = new PlaybackSessionCoordinator();
