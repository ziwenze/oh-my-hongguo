import { dataStore } from '../store/dataStore.ts';
import type {
  PlaybackSessionState,
  PlaybackSessionToken,
  PlaybackStatus,
  WatchHistoryItem,
} from '../../shared/types.ts';

export interface IHistorySink {
  saveHistory(item: WatchHistoryItem): Promise<void>;
}

// 严密的状态机转换白名单：禁止非法倒退 (例如禁止 playing -> ready)
const VALID_TRANSITIONS: Record<PlaybackStatus, PlaybackStatus[]> = {
  idle: ['resolving'],
  resolving: ['ready', 'playing', 'error', 'idle'],
  ready: ['playing', 'paused', 'error', 'idle'],
  playing: ['paused', 'ended', 'error', 'idle'],
  paused: ['playing', 'ended', 'error', 'idle'],
  ended: ['playing', 'resolving', 'error', 'idle'],
  error: ['resolving', 'idle'],
};

export class PlaybackSessionCoordinator {
  private store: IHistorySink;
  private currentSession: PlaybackSessionState | null = null;
  private lastSaveTimestamp = 0;
  private hasActuallyPlayed = false;
  private initialResumePos = 0;
  private throttleMs: number;
  private globalGeneration = 0;

  constructor(customStore?: IHistorySink, throttleMs = 3000) {
    this.store = customStore || dataStore;
    this.throttleMs = throttleMs;
  }

  public getCurrentSession(): PlaybackSessionState | null {
    return this.currentSession ? JSON.parse(JSON.stringify(this.currentSession)) : null;
  }

  // 校验操作者持有的 Token 与窗口归属权
  public validateToken(token?: PlaybackSessionToken | null, callerWindowId?: number): boolean {
    if (!this.currentSession || !token) return false;
    if (token.sessionId !== this.currentSession.token.sessionId) return false;
    if (token.generation !== this.currentSession.token.generation) return false;
    if (
      typeof callerWindowId === 'number' &&
      callerWindowId !== this.currentSession.token.ownerWindowId
    ) {
      return false;
    }
    return true;
  }

  // 1. 启动新会话：自动保存旧会话、生成新 Token 并隔离窗口所有权
  public async startSession(
    initData: {
      seriesId: string;
      seriesTitle: string;
      episodeId: string;
      episodeNumber: number;
      episodeTitle: string;
      positionSeconds?: number;
      durationSeconds?: number;
    },
    ownerWindowId = 1
  ): Promise<PlaybackSessionToken> {
    // 若已有旧会话且发生过真实播放，在新会话覆盖前执行最终落盘
    if (this.currentSession && this.hasActuallyPlayed) {
      await this.syncToHistoryStore();
    }

    const pos =
      typeof initData.positionSeconds === 'number' && Number.isFinite(initData.positionSeconds)
        ? Math.max(0, initData.positionSeconds)
        : 0;
    const dur =
      typeof initData.durationSeconds === 'number' && Number.isFinite(initData.durationSeconds)
        ? Math.max(0, initData.durationSeconds)
        : 0;

    // 严密逻辑：恢复历史断点不等于在本次会话中已发生播放
    this.hasActuallyPlayed = false;
    this.initialResumePos = pos;
    this.lastSaveTimestamp = 0;

    const token: PlaybackSessionToken = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      generation: ++this.globalGeneration,
      ownerWindowId,
    };

    this.currentSession = {
      token,
      seriesId: initData.seriesId,
      seriesTitle: initData.seriesTitle,
      episodeId: initData.episodeId,
      episodeNumber: initData.episodeNumber,
      episodeTitle: initData.episodeTitle,
      positionSeconds: pos,
      durationSeconds: dur,
      status: 'resolving',
    };

    return { ...token };
  }

  // 2. 状态机迁移：要求 Token 校验且禁止状态倒退
  public async updateStatus(
    token: PlaybackSessionToken,
    status: PlaybackStatus,
    errorMessage?: string,
    callerWindowId?: number
  ): Promise<boolean> {
    if (!this.validateToken(token, callerWindowId)) {
      console.warn('[Coordinator] Rejected updateStatus from invalid/stale session token');
      return false;
    }

    const currentStatus = this.currentSession!.status;
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(status)) {
      console.warn(
        `[Coordinator] Blocked invalid status transition from '${currentStatus}' to '${status}'`
      );
      return false;
    }

    this.currentSession!.status = status;
    if (errorMessage) {
      this.currentSession!.errorMessage = errorMessage;
    }

    if (status === 'playing') {
      this.hasActuallyPlayed = true;
      await this.syncToHistoryStore();
    } else if (status === 'paused' || status === 'ended') {
      if (this.hasActuallyPlayed) {
        await this.syncToHistoryStore();
      }
    }

    return true;
  }

  // 3. 更新播放进度：要求 Token 校验并执行节流
  public async updateProgress(
    token: PlaybackSessionToken,
    progress: { positionSeconds: number; durationSeconds?: number },
    callerWindowId?: number
  ): Promise<boolean> {
    if (!this.validateToken(token, callerWindowId)) {
      return false;
    }

    const pos =
      typeof progress.positionSeconds === 'number' && Number.isFinite(progress.positionSeconds)
        ? Math.max(0, progress.positionSeconds)
        : this.currentSession!.positionSeconds;
    const dur =
      typeof progress.durationSeconds === 'number' && Number.isFinite(progress.durationSeconds)
        ? Math.max(0, progress.durationSeconds)
        : this.currentSession!.durationSeconds;

    this.currentSession!.positionSeconds = pos;
    this.currentSession!.durationSeconds = dur;

    // 仅在真实处于 playing 状态或位移大于初始断点时确认播放
    if (
      this.currentSession!.status === 'playing' ||
      (this.currentSession!.status === 'ready' && pos > this.initialResumePos)
    ) {
      this.hasActuallyPlayed = true;
    }

    if (this.hasActuallyPlayed) {
      const now = Date.now();
      if (now - this.lastSaveTimestamp >= this.throttleMs) {
        this.lastSaveTimestamp = now;
        await this.syncToHistoryStore();
      }
    }

    return true;
  }

  // 4. 转移窗口所有权 (用于独立小窗 PiP 接力)
  public transferOwnership(newOwnerWindowId: number): PlaybackSessionToken | null {
    if (!this.currentSession) return null;
    this.currentSession.token.ownerWindowId = newOwnerWindowId;
    this.currentSession.token.generation = ++this.globalGeneration;
    return { ...this.currentSession.token };
  }

  // 5. 结束会话并确保最终进度持久化
  public async closeSession(
    token?: PlaybackSessionToken,
    callerWindowId?: number
  ): Promise<boolean> {
    if (token && !this.validateToken(token, callerWindowId)) {
      return false;
    }

    if (this.currentSession) {
      if (this.hasActuallyPlayed) {
        await this.syncToHistoryStore();
      }
      this.currentSession = null;
      this.hasActuallyPlayed = false;
    }

    return true;
  }

  // 退出前强制同步提交
  public closeSessionSync(): void {
    if (this.currentSession && this.hasActuallyPlayed) {
      // 触发数据持久层同步
      const { seriesId, seriesTitle, episodeId, episodeNumber, episodeTitle, positionSeconds, durationSeconds } =
        this.currentSession;
      const progressPercentage =
        durationSeconds > 0 ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100)) : 0;
      dataStore.saveHistorySync?.({
        seriesId,
        seriesTitle,
        episodeId,
        episodeNumber,
        episodeTitle,
        positionSeconds,
        durationSeconds,
        progressPercentage,
        updatedAt: Date.now(),
      });
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
