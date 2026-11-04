import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import type { PlaybackSessionState } from '../../shared/types.js';
import { WebPlayerAdapter } from '../player/WebPlayerAdapter.js';

export const PiPPlayerView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<WebPlayerAdapter | null>(null);

  const [session, setSession] = useState<PlaybackSessionState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let unmounted = false;

    const initPiP = async () => {
      try {
        const sess = await window.electronAPI.getCurrentSession();
        if (!sess || unmounted) {
          setErrorMsg('未检测到活跃播放会话');
          setIsLoading(false);
          return;
        }

        setSession(sess);
        setCurrentTime(sess.positionSeconds);

        const adapter = new WebPlayerAdapter({
          onTimeUpdate: (curr, dur) => {
            setCurrentTime(curr);
            setDuration(dur);
            if (sess.token) {
              window.electronAPI.updateSessionProgress(sess.token, {
                positionSeconds: curr,
                durationSeconds: dur,
              }).catch(() => {});
            }
          },
          onPlayStateChange: (playing) => {
            setIsPlaying(playing);
            if (sess.token) {
              window.electronAPI.updateSessionStatus(sess.token, playing ? 'playing' : 'paused').catch(() => {});
            }
          },
          onError: (err) => {
            setErrorMsg(err.message || '播放失败');
          },
        });

        if (videoRef.current) {
          adapter.attach(videoRef.current);
        }
        playerRef.current = adapter;

        // 获取媒体源并播放
        const source = await window.electronAPI.resolvePlaybackSource(sess.episodeId);
        if (unmounted) return;

        if (source.protected) {
          setErrorMsg('受保护媒体需待阶段 0 准入授权');
          setIsLoading(false);
          return;
        }

        await adapter.load(source, sess.positionSeconds);
        setIsLoading(false);
      } catch (err: any) {
        if (!unmounted) {
          setErrorMsg(err.message || '小窗加载失败');
          setIsLoading(false);
        }
      }
    };

    initPiP();

    return () => {
      unmounted = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const handleClose = async () => {
    await window.electronAPI.closePiPWindow();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white select-none overflow-hidden relative group">
      {/* 顶部轻量拖拽栏 */}
      <div className="drag-region absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-30 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-gray-200 line-clamp-1 font-medium pl-1">
          {session ? `${session.seriesTitle} · ${session.episodeTitle}` : '正在播放'}
        </span>
        <button
          onClick={handleClose}
          className="no-drag p-1 rounded-md bg-black/60 hover:bg-black/80 text-gray-300 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 视频容器 */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        <video ref={videoRef} playsInline className="w-full h-full object-contain pointer-events-none" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-3 text-center">
            <span className="text-xs text-red-400 font-medium mb-1">播放提示</span>
            <span className="text-[10px] text-gray-300 leading-tight">{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 底部悬浮控制栏 */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent z-30 opacity-0 group-hover:opacity-100 transition-opacity space-y-1">
        <div className="flex items-center justify-between text-[9px] text-gray-400">
          <span>{formatSeconds(currentTime)}</span>
          <span>{formatSeconds(duration)}</span>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => playerRef.current?.togglePlay()}
            className="p-1 rounded bg-primary text-white"
          >
            {isPlaying ? <Pause className="w-3 h-3 fill-white" /> : <Play className="w-3 h-3 fill-white" />}
          </button>
          <button
            onClick={() => {
              const nextM = !isMuted;
              setIsMuted(nextM);
              playerRef.current?.setVolume(nextM ? 0 : 1);
            }}
            className="p-1 text-gray-300 hover:text-white"
          >
            {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  );
};
