import { dataStore } from '../store/dataStore.js';
import type { PlaybackSessionState, WatchHistoryItem } from '../../shared/types.js';

class PlaybackSessionCoordinator {
  private currentSession: PlaybackSessionState | null = null;
  private lastSaveTimestamp = 0;

  public getCurrentSession(): PlaybackSessionState | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  // 启动或接力播放会话
  public async startSession(
    initData: Omit<PlaybackSessionState, 'isPlaying'>
  ): Promise<PlaybackSessionState> {
    this.currentSession = {
      ...initData,
      isPlaying: true,
    };

    // 同步到本地历史
    await this.syncToHistoryStore();
    return { ...this.currentSession };
  }

  // 更新播放进度并节流写入历史持久层
  public async updateProgress(progress: {
    positionSeconds: number;
    durationSeconds?: number;
  }): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.positionSeconds = progress.positionSeconds;
    if (typeof progress.durationSeconds === 'number' && progress.durationSeconds > 0) {
      this.currentSession.durationSeconds = progress.durationSeconds;
    }

    // 每 3 秒节流落盘一次
    const now = Date.now();
    if (now - this.lastSaveTimestamp > 3000) {
      this.lastSaveTimestamp = now;
      await this.syncToHistoryStore();
    }
  }

  // 结束会话并确保最终进度持久化
  public async closeSession(): Promise<void> {
    if (this.currentSession) {
      await this.syncToHistoryStore();
      this.currentSession = null;
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

    await dataStore.saveHistory(historyItem).catch((err) => {
      console.warn('[Coordinator] Failed to sync history:', err);
    });
  }
}

export const playbackCoordinator = new PlaybackSessionCoordinator();
