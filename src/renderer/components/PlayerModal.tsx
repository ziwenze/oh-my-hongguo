import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { DramaSummary, EpisodeItem } from '../../shared/types.js';
import { WebPlayerAdapter } from '../player/WebPlayerAdapter.js';

interface PlayerModalProps {
  drama: DramaSummary;
  episodes: EpisodeItem[];
  initialEpisodeId: string;
  initialPosition?: number;
  onClose: () => void;
  onSwitchEpisode: (episodeId: string) => void;
}

export const PlayerModal: React.FC<PlayerModalProps> = ({
  drama,
  episodes,
  initialEpisodeId,
  initialPosition = 0,
  onClose,
  onSwitchEpisode,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<WebPlayerAdapter | null>(null);

  const [currentEpisodeId, setCurrentEpisodeId] = useState(initialEpisodeId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [availableDefinitions, setAvailableDefinitions] = useState<string[]>([]);
  const [currentDefinition, setCurrentDefinition] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<{
    code: string;
    title: string;
    message: string;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastWheelTimestamp = useRef(0);

  // 异步请求时序与去重保护
  const activeGenerationRef = useRef(0);
  const inFlightEpisodeIdRef = useRef<string | null>(null);
  const hasMountedRef = useRef(false);

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId) || {
    id: currentEpisodeId,
    seriesId: drama.id,
    number: 1,
    title: '第1集',
    playable: true,
    isNew: false,
  };

  const currentIndex = episodes.findIndex((e) => e.id === currentEpisodeId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < episodes.length - 1;

  // 1. 初始化播放适配器
  useEffect(() => {
    const adapter = new WebPlayerAdapter({
      onTimeUpdate: (curr, dur) => {
        setCurrentTime(curr);
        setDuration(dur);
        window.electronAPI.updateSessionProgress({
          positionSeconds: curr,
          durationSeconds: dur,
        }).catch(() => {});
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        window.electronAPI.updateSessionStatus(playing ? 'playing' : 'paused').catch(() => {});
      },
      onEnded: () => {
        window.electronAPI.updateSessionStatus('ended').catch(() => {});
        handleNextEpisode();
      },
      onError: (err) => {
        console.warn('[PlayerModal] Video error event:', err.message);
        window.electronAPI.updateSessionStatus('error', err.message).catch(() => {});
        setErrorStatus({
          code: 'PLAYBACK_DECODE_ERROR',
          title: '媒体流解码或网络受限',
          message: '当前测试流由于编码格式（如 HEVC/bytevc1）或平台 DRM 保护限制，原生播放内核暂未支持解码。',
        });
      },
    });

    if (videoRef.current) {
      adapter.attach(videoRef.current);
    }
    playerRef.current = adapter;

    return () => {
      adapter.destroy();
      playerRef.current = null;
      window.electronAPI.closeSession().catch(() => {});
    };
  }, []);

  // 2. 统一切集控制器 (带 generation 防竞态、同集去重与严格状态机)
  const switchEpisode = useCallback(
    async (targetEpisodeId: string, resumeSeconds = 0, force = false) => {
      if (!force && inFlightEpisodeIdRef.current === targetEpisodeId && isLoading) {
        return; // 重复请求，直接拦截
      }

      const currentGen = ++activeGenerationRef.current;
      inFlightEpisodeIdRef.current = targetEpisodeId;
      setCurrentEpisodeId(targetEpisodeId);
      setIsLoading(true);
      setErrorStatus(null);

      // 通知父级组件同步选中态
      onSwitchEpisode(targetEpisodeId);

      const ep = episodes.find((e) => e.id === targetEpisodeId);
      const epNumber = ep?.number || 1;

      try {
        // 步骤 A: 启动会话为 resolving 态，不冒充 playing 写入历史
        await window.electronAPI.startSession({
          seriesId: drama.id,
          seriesTitle: drama.title,
          episodeId: targetEpisodeId,
          episodeNumber: epNumber,
          episodeTitle: ep?.title || `第${epNumber}集`,
          positionSeconds: resumeSeconds,
          durationSeconds: 0,
        });

        // 步骤 B: 解析媒体播放模型
        const source = await window.electronAPI.resolvePlaybackSource(targetEpisodeId);

        // 防竞态检查：若该请求已被后续切集覆盖，立即丢弃
        if (activeGenerationRef.current !== currentGen) {
          return;
        }

        const defs = source.streams.map((s) => s.definition);
        setAvailableDefinitions(defs);

        // 步骤 C: 阶段 0 准入状态检查：CENC 受保护流
        if (source.protected) {
          await window.electronAPI.updateSessionStatus('error', 'DRM_PROTECTED_GATE');
          setErrorStatus({
            code: 'DRM_PROTECTED_GATE',
            title: '受保护媒体 (阶段 0 决策门槛)',
            message: '该分集包含 CENC 样本级保护与 HEVC (bytevc1) 编码，依据 AGENTS.md 准入要求，受保护媒体须在获得明确播放授权与解码器验证后再行开启。',
          });
          setIsLoading(false);
          inFlightEpisodeIdRef.current = null;
          return;
        }

        // 步骤 D: 载入播放器适配器
        if (playerRef.current) {
          await playerRef.current.load(source, resumeSeconds);
          if (activeGenerationRef.current !== currentGen) return;
          setCurrentDefinition(playerRef.current.getCurrentDefinition());
          await window.electronAPI.updateSessionStatus('playing');
        }
      } catch (err: any) {
        if (activeGenerationRef.current !== currentGen) return;
        await window.electronAPI.updateSessionStatus('error', err.message);
        console.warn('[PlayerModal] resolvePlaybackSource error:', err.message);
        if (err.message && err.message.includes('ANONYMOUS_LIMITED')) {
          setErrorStatus({
            code: 'ANONYMOUS_LIMITED',
            title: '平台访问频控受限',
            message: '红果平台服务端限制了当前匿名设备的播放模型请求频率，请稍后再试或点击下方重试。',
          });
        } else {
          setErrorStatus({
            code: 'SOURCE_FETCH_ERROR',
            title: '播放地址解析失败',
            message: err.message || '网络请求失败或内容已下架。',
          });
        }
      } finally {
        if (activeGenerationRef.current === currentGen) {
          setIsLoading(false);
          inFlightEpisodeIdRef.current = null;
        }
      }
    },
    [drama.id, drama.title, episodes, onSwitchEpisode, isLoading]
  );

  // 挂载时触发初次加载，避免父级 re-render 引发重复请求
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      switchEpisode(initialEpisodeId, initialPosition);
    }
  }, [initialEpisodeId, initialPosition, switchEpisode]);

  // 3. 切集交互入口
  const handlePrevEpisode = () => {
    if (!hasPrev) return;
    const prevEp = episodes[currentIndex - 1];
    switchEpisode(prevEp.id, 0);
  };

  const handleNextEpisode = () => {
    if (!hasNext) return;
    const nextEp = episodes[currentIndex + 1];
    switchEpisode(nextEp.id, 0);
  };

  // 4. 滚轮防抖切集 (触控板惯性过滤)
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    // 350ms 防抖 + 最小移动阈值 25 过滤触控板惯性滑动
    if (now - lastWheelTimestamp.current < 350) return;
    if (Math.abs(e.deltaY) < 25) return;

    lastWheelTimestamp.current = now;
    if (e.deltaY > 0) {
      handleNextEpisode();
    } else {
      handlePrevEpisode();
    }
  };

  // 5. 全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          playerRef.current?.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playerRef.current?.seekRelative(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          playerRef.current?.seekRelative(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.min(1, v + 0.05);
            playerRef.current?.setVolume(nv);
            return nv;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.max(0, v - 0.05);
            playerRef.current?.setVolume(nv);
            return nv;
          });
          break;
        case '[':
          e.preventDefault();
          handlePrevEpisode();
          break;
        case ']':
          e.preventDefault();
          handleNextEpisode();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setIsMuted((m) => {
            const nextM = !m;
            playerRef.current?.setVolume(nextM ? 0 : volume);
            return nextM;
          });
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setIsFullscreen((f) => !f);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasPrev, hasNext, currentIndex, volume, onClose]);

  // 控制条自动隐藏 (3秒无鼠标移动)
  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onWheel={handleWheel}
      onMouseMove={triggerControls}
      className={`fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 flex items-center justify-center select-none overflow-hidden ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      {/* 9:16 短剧视窗容器 */}
      <div
        className={`relative bg-black rounded-2xl overflow-hidden border border-border/60 shadow-2xl flex flex-col justify-center items-center transition-all duration-200 ${
          isFullscreen ? 'w-full h-full rounded-none border-none' : 'w-full max-w-[460px] aspect-[9/16] max-h-[92vh]'
        }`}
      >
        {/* 原生视频元素 (居中 contain 保持画幅) */}
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* 顶部标题栏浮层 */}
        <div
          className={`absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-20 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex-1 pr-2">
            <h3 className="font-bold text-xs text-gray-100 line-clamp-1">{drama.title}</h3>
            <span className="text-[10px] text-gray-300">
              第 {currentEpisode.number} 集 · {currentEpisode.title}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-gray-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 阶段 0 决策与错误状态浮层 */}
        {errorStatus && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 animate-in fade-in">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-gray-100 mb-1">{errorStatus.title}</h3>
            <p className="text-xs text-muted max-w-xs mb-4 leading-relaxed">{errorStatus.message}</p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => switchEpisode(currentEpisodeId, currentTime, true)}
                className="px-3.5 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-xl text-xs text-gray-200 inline-flex items-center space-x-1 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                <span>重新探测</span>
              </button>
              {hasNext && (
                <button
                  onClick={handleNextEpisode}
                  className="px-3.5 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-xl text-xs text-primary transition-colors"
                >
                  尝试下一集
                </button>
              )}
            </div>
          </div>
        )}

        {/* 加载中动画 */}
        {isLoading && !errorStatus && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
            <RefreshCw className="w-8 h-8 text-primary animate-spin mb-2" />
            <span className="text-xs text-gray-300">正在接入媒体流...</span>
          </div>
        )}

        {/* 底部控制栏浮层 */}
        <div
          className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 space-y-2 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* 进度条 */}
          <div className="flex items-center space-x-2 text-[10px] text-gray-300">
            <span>{formatSeconds(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => {
                const target = parseFloat(e.target.value);
                setCurrentTime(target);
                playerRef.current?.seek(target);
              }}
              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span>{formatSeconds(duration)}</span>
          </div>

          {/* 控制按钮组 */}
          <div className="flex items-center justify-between text-gray-200 pt-0.5">
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevEpisode}
                disabled={!hasPrev}
                title="上一集 ([)"
                className="p-1 hover:text-primary disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => playerRef.current?.togglePlay()}
                title="播放/暂停 (Space)"
                className="p-1.5 rounded-full bg-primary text-white hover:scale-105 transition-transform"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
              </button>
              <button
                onClick={handleNextEpisode}
                disabled={!hasNext}
                title="下一集 (])"
                className="p-1 hover:text-primary disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const nextM = !isMuted;
                  setIsMuted(nextM);
                  playerRef.current?.setVolume(nextM ? 0 : volume);
                }}
                title={isMuted ? '取消静音 (M)' : '静音 (M)'}
                className="p-1 hover:text-primary ml-1"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* 清晰度与倍速选项 */}
            <div className="flex items-center space-x-2 text-xs">
              {availableDefinitions.length > 0 && (
                <select
                  value={currentDefinition}
                  onChange={(e) => {
                    const def = e.target.value;
                    setCurrentDefinition(def);
                    playerRef.current?.setDefinition(def);
                  }}
                  className="bg-black/60 border border-white/20 rounded-md px-1.5 py-0.5 text-[10px] text-gray-200 focus:outline-none"
                >
                  {availableDefinitions.map((def) => (
                    <option key={def} value={def}>
                      {def}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={playbackRate}
                onChange={(e) => {
                  const rate = parseFloat(e.target.value);
                  setPlaybackRate(rate);
                  playerRef.current?.setPlaybackRate(rate);
                }}
                className="bg-black/60 border border-white/20 rounded-md px-1.5 py-0.5 text-[10px] text-gray-200 focus:outline-none"
              >
                <option value={0.75}>0.75x</option>
                <option value={1.0}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2.0}>2.0x</option>
                <option value={3.0}>3.0x</option>
              </select>

              <button
                onClick={() => setIsFullscreen((f) => !f)}
                title="全屏切换 (F)"
                className="p-1 text-gray-300 hover:text-white"
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
