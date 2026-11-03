import type { PlaybackMediaSource } from '../../shared/types.js';

export interface PlayerEvents {
  onTimeUpdate?: (positionSeconds: number, durationSeconds: number) => void;
  onEnded?: () => void;
  onError?: (err: Error) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onFirstFrameRendered?: () => void;
}

export class WebPlayerAdapter {
  private videoEl: HTMLVideoElement | null = null;
  private currentSource: PlaybackMediaSource | null = null;
  private currentDefinition: string = '';
  private events: PlayerEvents = {};
  private hasReportedFirstFrame = false;

  constructor(events: PlayerEvents = {}) {
    this.events = events;
  }

  public attach(videoElement: HTMLVideoElement): void {
    this.videoEl = videoElement;
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.videoEl) return;

    this.videoEl.addEventListener('timeupdate', this.handleTimeUpdate);
    this.videoEl.addEventListener('ended', this.handleEnded);
    this.videoEl.addEventListener('play', this.handlePlay);
    this.videoEl.addEventListener('pause', this.handlePause);
    this.videoEl.addEventListener('error', this.handleError);

    // 标准 video.requestVideoFrameCallback 测量首帧渲染 (符合 ROADMAP 规范)
    if ('requestVideoFrameCallback' in this.videoEl) {
      (this.videoEl as any).requestVideoFrameCallback(() => {
        if (!this.hasReportedFirstFrame) {
          this.hasReportedFirstFrame = true;
          this.events.onFirstFrameRendered?.();
        }
      });
    }
  }

  private handleTimeUpdate = () => {
    if (!this.videoEl) return;
    this.events.onTimeUpdate?.(this.videoEl.currentTime, this.videoEl.duration || 0);
  };

  private handleEnded = () => {
    this.events.onEnded?.();
  };

  private handlePlay = () => {
    this.events.onPlayStateChange?.(true);
  };

  private handlePause = () => {
    this.events.onPlayStateChange?.(false);
  };

  private handleError = () => {
    const err = this.videoEl?.error;
    this.events.onError?.(
      new Error(err?.message || '视频源解码或网络拉取失败，请检查流格式或媒体授权状态')
    );
  };

  // 载入媒体源并选出最佳清晰度
  public async load(source: PlaybackMediaSource, initialPosition = 0): Promise<void> {
    this.currentSource = source;
    this.hasReportedFirstFrame = false;

    if (!this.videoEl) {
      throw new Error('Video element is not attached');
    }

    if (!source.streams || source.streams.length === 0) {
      throw new Error('当前分集未返回可用的清晰度流');
    }

    // 默认优先选择清晰度较高且具有 URL 的流
    const candidate =
      source.streams.find((s) => s.definition === '720p' && s.url) ||
      source.streams.find((s) => s.definition === '1080p' && s.url) ||
      source.streams[0];

    if (!candidate || !candidate.url) {
      throw new Error('未检索到有效的播放直链 URL');
    }

    this.currentDefinition = candidate.definition;
    this.videoEl.src = candidate.url;

    if (initialPosition > 0) {
      this.videoEl.currentTime = initialPosition;
    }

    try {
      await this.videoEl.play();
    } catch (e: any) {
      // 浏览器可能需要交互或静音自动播放
      console.warn('[WebPlayerAdapter] Autoplay restricted or deferred:', e.message);
    }
  }

  public setDefinition(definition: string): void {
    if (!this.currentSource || !this.videoEl) return;
    const targetStream = this.currentSource.streams.find((s) => s.definition === definition);
    if (!targetStream || !targetStream.url) return;

    const currentTime = this.videoEl.currentTime;
    const isPaused = this.videoEl.paused;

    this.currentDefinition = definition;
    this.videoEl.src = targetStream.url;
    this.videoEl.currentTime = currentTime;

    if (!isPaused) {
      this.videoEl.play().catch(() => {});
    }
  }

  public play(): Promise<void> {
    return this.videoEl ? this.videoEl.play() : Promise.resolve();
  }

  public pause(): void {
    this.videoEl?.pause();
  }

  public togglePlay(): void {
    if (!this.videoEl) return;
    if (this.videoEl.paused) {
      this.videoEl.play().catch(() => {});
    } else {
      this.videoEl.pause();
    }
  }

  public seek(seconds: number): void {
    if (!this.videoEl) return;
    this.videoEl.currentTime = Math.max(0, Math.min(seconds, this.videoEl.duration || 0));
  }

  public seekRelative(deltaSeconds: number): void {
    if (!this.videoEl) return;
    this.seek(this.videoEl.currentTime + deltaSeconds);
  }

  public setVolume(volume: number): void {
    if (!this.videoEl) return;
    this.videoEl.volume = Math.max(0, Math.min(1, volume));
  }

  public setPlaybackRate(rate: number): void {
    if (!this.videoEl) return;
    this.videoEl.playbackRate = rate;
  }

  public getCurrentDefinition(): string {
    return this.currentDefinition;
  }

  public destroy(): void {
    if (this.videoEl) {
      this.videoEl.removeEventListener('timeupdate', this.handleTimeUpdate);
      this.videoEl.removeEventListener('ended', this.handleEnded);
      this.videoEl.removeEventListener('play', this.handlePlay);
      this.videoEl.removeEventListener('pause', this.handlePause);
      this.videoEl.removeEventListener('error', this.handleError);
      this.videoEl.pause();
      this.videoEl.src = '';
      this.videoEl = null;
    }
    this.currentSource = null;
  }
}
