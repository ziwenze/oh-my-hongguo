import React, { useState } from 'react';
import { Bookmark, History, Trash2, Play, Film } from 'lucide-react';
import type { DramaSummary } from '../../shared/types.js';
import { useLibraryStore } from '../store/useLibraryStore.js';
import { EmptyState } from '../components/EmptyState.js';

interface LibraryViewProps {
  onSelectDrama: (drama: DramaSummary) => void;
  onPlayEpisode: (seriesId: string, episodeId: string, episodeNumber: number, positionSeconds: number) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onSelectDrama, onPlayEpisode }) => {
  const [subTab, setSubTab] = useState<'favorites' | 'history'>('favorites');
  const { history, favorites, clearHistory } = useLibraryStore();

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* 顶部二级 Tab */}
      <div className="flex items-center p-1 bg-surface border border-border rounded-xl">
        <button
          onClick={() => setSubTab('favorites')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
            subTab === 'favorites'
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted hover:text-gray-200'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>我的追剧 ({favorites.length})</span>
        </button>
        <button
          onClick={() => setSubTab('history')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
            subTab === 'history'
              ? 'bg-card text-accent shadow-sm'
              : 'text-muted hover:text-gray-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>观看历史 ({history.length})</span>
        </button>
      </div>

      {/* 追剧列表 */}
      {subTab === 'favorites' && (
        <div className="space-y-3">
          {favorites.length === 0 ? (
            <EmptyState
              title="暂无追剧收藏"
              description="在浏览短剧或打开详情时，点击“追剧”即可将喜欢的短剧加入收藏"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {favorites.map((fav) => (
                <div
                  key={fav.seriesId}
                  onClick={() =>
                    onSelectDrama({
                      id: fav.seriesId,
                      title: fav.seriesTitle,
                      description: '',
                      coverUrl: fav.cachedCoverUrl || '',
                      coverExpiresAt: fav.cachedCoverExpiresAt,
                      episodeCount: fav.episodeCount,
                    })
                  }
                  className="group bg-card border border-border/70 hover:border-primary/50 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg flex flex-col"
                >
                  <div className="aspect-[3/4] bg-surface-hover relative overflow-hidden">
                    {fav.cachedCoverUrl ? (
                      <img src={fav.cachedCoverUrl} alt={fav.seriesTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted">
                        <Film className="w-8 h-8 opacity-40" />
                      </div>
                    )}
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 backdrop-blur-md rounded text-[10px] text-gray-200">
                      共 {fav.episodeCount} 集
                    </span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <h4 className="font-semibold text-xs text-gray-100 line-clamp-1 group-hover:text-primary transition-colors">
                      {fav.seriesTitle}
                    </h4>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 观看历史 */}
      {subTab === 'history' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted">已记录最近观看的剧集与断点进度</span>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-muted hover:text-red-400 flex items-center space-x-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>清空历史</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <EmptyState
              title="暂无观看历史"
              description="播放短剧分集时，系统会自动记录您看到第几集第几秒，方便随时续播"
            />
          ) : (
            <div className="space-y-2">
              {history.map((hist) => (
                <div
                  key={`${hist.seriesId}_${hist.episodeId}`}
                  className="p-3 bg-card border border-border/70 rounded-xl flex items-center justify-between hover:border-border transition-colors group"
                >
                  <div className="flex-1 pr-3">
                    <h4 className="font-semibold text-xs text-gray-100 line-clamp-1 group-hover:text-primary transition-colors">
                      {hist.seriesTitle}
                    </h4>
                    <div className="flex items-center space-x-2 mt-1 text-[11px] text-muted">
                      <span className="text-gray-300">第 {hist.episodeNumber} 集 · {hist.episodeTitle}</span>
                      <span>·</span>
                      <span className="text-accent font-medium">{formatSeconds(hist.positionSeconds)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onPlayEpisode(hist.seriesId, hist.episodeId, hist.episodeNumber, hist.positionSeconds)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl text-xs font-medium transition-colors"
                  >
                    <Play className="w-3 h-3 fill-primary" />
                    <span>续播</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
