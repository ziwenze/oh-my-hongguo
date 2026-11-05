import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import type { DramaSummary, EpisodeItem, PlaybackSessionToken } from '../../shared/types.js';
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
  const [isHandoffPending, setIsHandoffPending] = useState(false); // 正在独立小窗接力中
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastWheelTimestamp = useRef(0);

  // 异步请求时序、代际与会话所有权 Token
  const activeGenerationRef = useRef(0);
  const inFlightEpisodeIdRef = useRef<string | null>(null);
  const hasMountedRef = useRef(false);
  const sessionTokenRef = useRef<PlaybackSessionToken | null>(null);
  const isHandoffRef = useRef(false); // 标记是否处于小窗移交状态，防止卸载时误关会话
  const currentTimeRef = useRef(initialPosition);
  currentTimeRef.current = currentTime;

  // 稳定回调引用：防止父组件 re-render 重新生成函数引用导致播放器 Effect 被清理销毁
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  const handleNextEpisodeRef = useRef<() => void>(() => {});

  // 1. 初始化播放适配器 (生命周期严格仅与 PlayerModal 挂载/卸载绑定)
  useEffect(() => {
    const adapter = new WebPlayerAdapter({
      onTimeUpdate: (curr, dur) => {
        setCurrentTime(curr);
        setDuration(dur);
        if (sessionTokenRef.current) {
          window.electronAPI.updateSessionProgress(sessionTokenRef.current, {
            positionSeconds: curr,
            durationSeconds: dur,
          }).catch(() => {});
        }
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        if (sessionTokenRef.current) {
          window.electronAPI
            .updateSessionStatus(sessionTokenRef.current, playing ? 'playing' : 'paused')
            .catch(() => {});
        }
      },
      onEnded: () => {
        if (sessionTokenRef.current) {
          window.electronAPI.updateSessionStatus(sessionTokenRef.current, 'ended').catch(() => {});
        }
        handleNextEpisodeRef.current();
      },
      onError: (err) => {
        console.warn('[PlayerModal] Video error event:', err.message);
        if (sessionTokenRef.current) {
          window.electronAPI.updateSessionStatus(sessionTokenRef.current, 'error', err.message).catch(() => {});
        }
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

    // 监听主进程发来的小窗接力事件：暂停发声、确认源端暂停、保持播放器实例挂载 (Prepare 阶段绝不提前销毁组件)
    const unsubHandoffTo = window.electronAPI.onHandoffToPiP(async () => {
      adapter.pause();
      setIsPlaying(false);
      setIsHandoffPending(true);
      await window.electronAPI.ackSourcePaused(currentTimeRef.current);
    });

    // 监听接力迁回事件 (无论是小窗正常关闭还是接力异常回滚，均在原播放器中直接恢复)
    const unsubHandoffFrom = window.electronAPI.onHandoffFromPiP(async ({ newToken, session: restoredSession }) => {
      setIsHandoffPending(false);
      isHandoffRef.current = false;
      sessionTokenRef.current = newToken;
      setCurrentTime(restoredSession.positionSeconds);
      if (playerRef.current) {
        playerRef.current.seek(restoredSession.positionSeconds);
        playerRef.current.play().catch(() => {});
      }
    });

    return () => {
      unsubHandoffTo();
      unsubHandoffFrom();
      adapter.destroy();
      playerRef.current = null;
      // 只有在非移交场景 (用户主动关闭播放器) 时才真正关闭会话！移交场景下会话必须完整存续供小窗接管
      if (!isHandoffRef.current && sessionTokenRef.current) {
        window.electronAPI.closeSession(sessionTokenRef.current).catch(() => {});
        sessionTokenRef.current = null;
      }
    };
  }, []); // 严格空依赖数组，杜绝父级回调刷新意外触发销毁

  // 2. 统一切集控制器 (带 Token 所有权、generation 防竞态、同集去重与严格状态机)
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
        // 步骤 A: 启动会话为 resolving 态，签发专属 Session Token
        const token = await window.electronAPI.startSession({
          seriesId: drama.id,
          seriesTitle: drama.title,
          episodeId: targetEpisodeId,
          episodeNumber: epNumber,
          episodeTitle: ep?.title || `第${epNumber}集`,
          positionSeconds: resumeSeconds,
          durationSeconds: 0,
        });

        // 若切集已被新操作覆盖，放弃过期的 token
        if (activeGenerationRef.current !== currentGen) {
          return;
        }
        sessionTokenRef.current = token;

        // 步骤 B: 解析媒体播放模型
        const source = await window.electronAPI.resolvePlaybackSource(targetEpisodeId);

        if (activeGenerationRef.current !== currentGen) {
          return;
        }

        // 排序可用清晰度：优先置顶 1080p 超清
        const defRank: Record<string, number> = { '1080p': 5, '720p': 4, '540p': 3, '480p': 2, '360p': 1 };
        const defs = [...new Set(source.streams.map((s) => s.definition))].sort(
          (a, b) => (defRank[b] || 0) - (defRank[a] || 0)
        );
        setAvailableDefinitions(defs);

        // 步骤 C: 媒体保护状态检查 (未获取到解密密钥的受保护流)
        if (source.protected) {
          await window.electronAPI.updateSessionStatus(token, 'error', 'DRM_PROTECTED_GATE');
          setErrorStatus({
            code: 'DRM_PROTECTED_GATE',
            title: '媒体缺少解密密钥',
            message: '该分集包含未授权的 DRM 保护，当前未取得有效解密密钥。',
          });
          setIsLoading(false);
          inFlightEpisodeIdRef.current = null;
          return;
        }

        // 步骤 D: 载入播放器适配器
        if (playerRef.current) {
          await window.electronAPI.updateSessionStatus(token, 'ready');
          await playerRef.current.load(source, resumeSeconds);
          if (activeGenerationRef.current !== currentGen) return;
          setCurrentDefinition(playerRef.current.getCurrentDefinition() || defs[0] || '1080p');
        }
      } catch (err: any) {
        if (activeGenerationRef.current !== currentGen) return;
        if (sessionTokenRef.current) {
          await window.electronAPI.updateSessionStatus(sessionTokenRef.current, 'error', err.message);
        }
        console.warn('[PlayerModal] resolvePlaybackSource error:', err.message);
        const isAnonLimited = Boolean(
          err?.message && (
            err.message.includes('ANONYMOUS_LIMITED') ||
            err.message.includes('anonymous response was empty') ||
            err.message.includes('rate limited')
          )
        );
        if (isAnonLimited) {
          setErrorStatus({
            code: 'ANONYMOUS_LIMITED',
            title: '平台访问频控受限',
            message: '红果平台限制了当前匿名设备/IP的播放模型请求频率（ANONYMOUS_LIMITED）。请稍候再试，或点击重试。',
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
  handleNextEpisodeRef.current = handleNextEpisode;

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

  // 全屏切换：调用浏览器标准 Fullscreen API 切换真正的系统级全屏
  const toggleTrueFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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
          toggleTrueFullscreen();
          break;
        case 'Escape':
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            onClose();
          }
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
      className="fixed inset-0 w-full h-full bg-black z-50 flex flex-col justify-between select-none overflow-hidden"
    >
      {/* 居中视窗容器：默认占满当前应用窗口全部空间，左右黑边自适应，双击切换系统全屏，单击切换播放/暂停 */}
      <div
        onClick={() => playerRef.current?.togglePlay()}
        onDoubleClick={toggleTrueFullscreen}
        className="relative w-full h-full bg-black flex flex-col justify-center items-center overflow-hidden cursor-pointer"
      >
        {/* 原生视频元素 (居中 contain 保持短剧竖屏画幅) */}
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* 顶部标题栏浮层 */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-0 left-0 right-0 p-3.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between z-20 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center space-x-2.5 flex-1 pr-3">
            <button
              onClick={onClose}
              title="返回 (Esc)"
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-gray-100 line-clamp-1">{drama.title}</h3>
              <span className="text-[11px] text-gray-400">
                第 {currentEpisode.number} 集 · {currentEpisode.title}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            title="退出播放 (Esc)"
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-gray-300 hover:text-white transition-colors"
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

        {/* 独立小窗接力状态浮层 (保持播放器实例挂载，支持一键召回) */}
        {isHandoffPending && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-40 animate-in fade-in">
            <PictureInPicture2 className="w-10 h-10 text-primary mb-3 animate-pulse" />
            <h3 className="text-sm font-bold text-gray-100 mb-1">正在独立置顶小窗播放中</h3>
            <p className="text-xs text-muted mb-4 max-w-xs leading-relaxed">
              主窗口已安全暂停并停止发声，小窗关闭或异常时将在此处无缝接力续播
            </p>
            <button
              onClick={async () => {
                await window.electronAPI.closePiPWindow();
              }}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 rounded-xl text-xs text-primary font-medium transition-colors"
            >
              收回并在主窗口继续播放
            </button>
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
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent z-20 space-y-2 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
                onClick={async () => {
                  playerRef.current?.pause();
                  isHandoffRef.current = true;
                  const success = await window.electronAPI.openPiPWindow();
                  if (success) {
                    onClose();
                  } else {
                    isHandoffRef.current = false;
                    playerRef.current?.play().catch(() => {});
                    alert('独立置顶小窗开启失败或当前无活跃播放会话');
                  }
                }}
                title="开启独立置顶摸鱼小窗 (PiP)"
                className="p-1 text-gray-300 hover:text-primary transition-colors"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleTrueFullscreen}
                title={isFullscreen ? '退出全屏 (F / Esc)' : '系统全屏 (F)'}
                className="p-1 text-gray-300 hover:text-white transition-colors"
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
