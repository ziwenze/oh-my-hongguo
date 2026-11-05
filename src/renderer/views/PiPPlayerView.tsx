import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Volume2, VolumeX, RefreshCw, RotateCcw, RotateCw } from 'lucide-react';
import type { PlaybackSessionState, PlaybackSessionToken } from '../../shared/types.js';
import { WebPlayerAdapter } from '../player/WebPlayerAdapter.js';

export const PiPPlayerView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<WebPlayerAdapter | null>(null);
  const sessionTokenRef = useRef<PlaybackSessionToken | null>(null);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [session, setSession] = useState<PlaybackSessionState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  // 控制面板活动感知：鼠标移动或暂停时常驻，播放中 3 秒无操作自动淡出
  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isPlaying) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    } else {
      triggerControls();
    }
  }, [isPlaying]);

  useEffect(() => {
    let unmounted = false;

    // 1. 初始化播放适配器
    const adapter = new WebPlayerAdapter({
      onTimeUpdate: (curr, dur) => {
        setCurrentTime(curr);
        setDuration(dur);
        if (sessionTokenRef.current) {
          window.electronAPI
            .updateSessionProgress(sessionTokenRef.current, {
              positionSeconds: curr,
              durationSeconds: dur,
            })
            .catch(() => {});
        }
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        if (sessionTokenRef.current) {
          window.electronAPI
            .updateSessionStatus(sessionTokenRef.current, playing ? 'playing' : 'paused')
            .catch(() => {});
          if (playing) {
            window.electronAPI.ackTargetPlaying(sessionTokenRef.current).catch(() => {});
          }
        }
      },
      onAwaitingUserGesture: () => {
        if (sessionTokenRef.current) {
          window.electronAPI.ackAwaitingUserGesture(sessionTokenRef.current).catch(() => {});
        }
      },
      onError: (err) => {
        setErrorMsg(err.message || '播放失败');
        if (sessionTokenRef.current) {
          window.electronAPI.reportPiPPlaybackError(sessionTokenRef.current, err.message).catch(() => {});
        }
      },
    });

    if (videoRef.current) {
      adapter.attach(videoRef.current);
    }
    playerRef.current = adapter;

    // 2. 监听主进程 Commit 消息 (携带原子移交的合法新 Token 与最新播放断点)
    const unsubCommit = window.electronAPI.onHandoffCommit(
      async ({ newToken, session: committedSession }) => {
        if (unmounted) return;
        sessionTokenRef.current = newToken;
        setSession(committedSession);
        setCurrentTime(committedSession.positionSeconds);

        try {
          const source = await window.electronAPI.resolvePlaybackSource(committedSession.episodeId);
          if (unmounted) return;

          if (source.protected) {
            setErrorMsg('该分集缺少解密密钥');
            setIsLoading(false);
            window.electronAPI.reportPiPPlaybackError(newToken, 'DRM_PROTECTED_GATE').catch(() => {});
            return;
          }

          // 步骤 3: 收到合法 Token 后才开始缓冲播放，杜绝旧 Token 拒录与双窗口发声
          await window.electronAPI.updateSessionStatus(newToken, 'ready');
          await adapter.load(source, committedSession.positionSeconds);
          setIsLoading(false);
        } catch (err: any) {
          if (!unmounted) {
            setErrorMsg(err.message || '小窗加载失败');
            setIsLoading(false);
            window.electronAPI.reportPiPPlaybackError(newToken, err.message).catch(() => {});
          }
        }
      }
    );

    // 3. 向主进程发送 Ack 确认渲染帧已就绪，请求 Commit
    window.electronAPI.ackPiPReady().catch((err) => {
      console.warn('[PiP] ackPiPReady warning:', err);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      triggerControls();
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
          setIsMuted(false);
          setVolume((v) => {
            const nv = Math.min(1, Math.round((v + 0.05) * 100) / 100);
            playerRef.current?.setVolume(nv);
            return nv;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.max(0, Math.round((v - 0.05) * 100) / 100);
            playerRef.current?.setVolume(nv);
            return nv;
          });
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
        case 'Escape':
          e.preventDefault();
          window.electronAPI.closePiPWindow().catch(() => {});
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unmounted = true;
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      unsubCommit();
      adapter.destroy();
      playerRef.current = null;
    };
  }, [volume]);

  const handleClose = async () => {
    await window.electronAPI.closePiPWindow();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    setCurrentTime(pos);
    playerRef.current?.seek(pos);
  };

  return (
    <div
      onMouseMove={triggerControls}
      onMouseEnter={triggerControls}
      onClick={triggerControls}
      className="flex flex-col h-screen w-screen bg-black text-white select-none overflow-hidden relative"
    >
      {/* 顶部轻量拖拽栏 */}
      <div
        className={`drag-region absolute top-0 left-0 right-0 p-2.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between z-30 transition-opacity duration-200 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span className="text-[11px] text-gray-200 line-clamp-1 font-semibold pl-1">
          {session ? `${session.seriesTitle} · ${session.episodeTitle}` : '正在小窗播放'}
        </span>
        <button
          onClick={handleClose}
          title="关闭小窗 (返回主窗口)"
          className="no-drag p-1 rounded-md bg-black/70 hover:bg-red-500/90 text-gray-200 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 视频容器 (点击视频居中区域可直接切换暂停/播放) */}
      <div
        onClick={() => playerRef.current?.togglePlay()}
        className="flex-1 flex items-center justify-center bg-black relative cursor-pointer"
      >
        <video ref={videoRef} playsInline className="w-full h-full object-contain pointer-events-none" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-3 text-center">
            <span className="text-xs text-red-400 font-medium mb-1">播放提示</span>
            <span className="text-[10px] text-gray-300 leading-tight">{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 底部悬浮控制栏 */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent z-30 space-y-1.5 transition-opacity duration-200 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 进度拖拽条 */}
        <div className="w-full flex items-center space-x-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-white/20 hover:bg-white/30 rounded-full appearance-none cursor-pointer accent-primary"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-gray-300">
          <span>{formatSeconds(currentTime)} / {formatSeconds(duration)}</span>

          {/* 核心操作按钮组 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => playerRef.current?.seekRelative(-5)}
              title="快退 5 秒"
              className="p-1 rounded-md hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => playerRef.current?.togglePlay()}
              title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
              className="w-7 h-7 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center text-white shadow-md transition-transform active:scale-90"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
            </button>

            <button
              onClick={() => playerRef.current?.seekRelative(5)}
              title="快进 5 秒"
              className="p-1 rounded-md hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 音量调节组 */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                const nextM = !isMuted;
                setIsMuted(nextM);
                playerRef.current?.setVolume(nextM ? 0 : volume);
              }}
              title={isMuted ? '取消静音 (M)' : `静音 (M) - 当前 ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              className="p-1 rounded-md hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const nv = parseFloat(e.target.value);
                setVolume(nv);
                if (nv > 0 && isMuted) setIsMuted(false);
                playerRef.current?.setVolume(nv);
              }}
              title={`音量: ${Math.round((isMuted ? 0 : volume) * 100)}% (↑/↓)`}
              className="w-12 h-1 bg-white/20 hover:bg-white/30 rounded-full appearance-none cursor-pointer accent-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

