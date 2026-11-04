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
  // 媒体源代际标识，防止并发调用 load 时旧流覆盖新流
  private loadGeneration = 0;

  constructor(events: PlayerEvents = {}) {
    this.events = events;
  }

  public attach(videoElement: HTMLVideoElement): void {
    if (this.videoEl && this.videoEl !== videoElement) {
      this.detachEvents();
    }
    this.videoEl = videoElement;
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.videoEl) return;

    this.videoEl.addEventListener('timeupdate', this.handleTimeUpdate);
    this.videoEl.addEventListener('ended', this.handleEnded);
    // 监听真实的 playing 事件 (表示视频帧实际已开始渲染播放，而非单纯调用 play() 的意图)
    this.videoEl.addEventListener('playing', this.handlePlaying);
    this.videoEl.addEventListener('pause', this.handlePause);
    this.videoEl.addEventListener('error', this.handleError);
  }

  private detachEvents(): void {
    if (!this.videoEl) return;
    this.videoEl.removeEventListener('timeupdate', this.handleTimeUpdate);
    this.videoEl.removeEventListener('ended', this.handleEnded);
    this.videoEl.removeEventListener('playing', this.handlePlaying);
    this.videoEl.removeEventListener('pause', this.handlePause);
    this.videoEl.removeEventListener('error', this.handleError);
  }

  // 为每次载入的新媒体独立布防首帧渲染回调 (符合 ROADMAP P95 统计规范)
  private armFirstFrameMeasurement(): void {
    if (!this.videoEl) return;
    this.hasReportedFirstFrame = false;
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

  private handlePlaying = () => {
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

  // 载入媒体源并选出最佳清晰度 (带代际检查)
  public async load(source: PlaybackMediaSource, initialPosition = 0): Promise<void> {
    const gen = ++this.loadGeneration;
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

    if (this.loadGeneration !== gen) return;

    this.currentDefinition = candidate.definition;
    this.videoEl.src = candidate.url;

    if (initialPosition > 0) {
      this.videoEl.currentTime = initialPosition;
    }

    this.armFirstFrameMeasurement();

    try {
      await this.videoEl.play();
      if (this.loadGeneration !== gen) {
        this.videoEl.pause();
        return;
      }
    } catch (e: any) {
      if (this.loadGeneration !== gen) return;
      console.warn('[WebPlayerAdapter] Play attempt deferred or restricted:', e.message);
      this.events.onPlayStateChange?.(false);

      // 若为浏览器自动播放受限 (NotAllowedError)，等待用户交互触发，不视作解码故障
      if (e.name === 'NotAllowedError') {
        return;
      }

      // 其他致命解码或格式错误，向上派发
      this.events.onError?.(e);
      throw e;
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
    this.loadGeneration++;
    if (this.videoEl) {
      this.detachEvents();
      this.videoEl.pause();
      this.videoEl.src = '';
      this.videoEl = null;
    }
    this.currentSource = null;
  }
}
