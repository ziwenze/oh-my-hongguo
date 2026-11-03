import React from 'react';
import { X, Bookmark, RefreshCw } from 'lucide-react';
import { useDramaStore } from '../store/useDramaStore.js';
import { useLibraryStore } from '../store/useLibraryStore.js';

interface EpisodeDrawerProps {
  onPlayEpisode: (episodeId: string, episodeNumber: number) => void;
}

export const EpisodeDrawer: React.FC<EpisodeDrawerProps> = ({ onPlayEpisode }) => {
  const {
    selectedDrama,
    episodes,
    episodesLoading,
    episodesHasMore,
    closeDramaDetail,
    loadMoreEpisodes,
  } = useDramaStore();

  const { isFavorited, toggleFavorite } = useLibraryStore();

  if (!selectedDrama) return null;

  const favorited = isFavorited(selectedDrama.id);

  const handleFavorite = () => {
    toggleFavorite({
      id: selectedDrama.id,
      title: selectedDrama.title,
      coverUrl: selectedDrama.coverUrl,
      coverExpiresAt: selectedDrama.coverExpiresAt,
      episodeCount: selectedDrama.episodeCount,
    });
  };

  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-xl z-40 flex flex-col p-4 animate-in fade-in duration-200 select-none">
      {/* 头部标题与操作 */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex-1 pr-3">
          <h3 className="font-bold text-sm text-gray-100 line-clamp-1">{selectedDrama.title}</h3>
          <span className="text-[11px] text-muted">
            {selectedDrama.episodeCount ? `全 ${selectedDrama.episodeCount} 集` : '短剧剧集列表'}
            {selectedDrama.category && ` · ${selectedDrama.category}`}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleFavorite}
            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center space-x-1 transition-colors ${
              favorited
                ? 'bg-primary/20 text-primary border-primary/40 font-medium'
                : 'border-border text-muted hover:text-gray-200 hover:bg-surface-hover'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>{favorited ? '已追剧' : '追剧'}</span>
          </button>
          <button
            onClick={closeDramaDetail}
            className="p-1.5 text-muted hover:text-gray-200 rounded-lg hover:bg-surface-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 剧情简介 */}
      {selectedDrama.description && (
        <div className="py-2.5 border-b border-border/40">
          <p className="text-xs text-muted leading-relaxed line-clamp-3">
            {selectedDrama.description}
          </p>
        </div>
      )}

      {/* 选集网格列表 */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-3">
        <div className="flex items-center justify-between pb-2.5">
          <span className="text-xs font-semibold text-gray-300">
            选集播放 ({episodes.length} / {selectedDrama.episodeCount || episodes.length})
          </span>
          {episodesLoading && (
            <div className="flex items-center space-x-1 text-[11px] text-muted">
              <RefreshCw className="w-3 h-3 animate-spin text-primary" />
              <span>载入分集中...</span>
            </div>
          )}
        </div>

        {episodes.length === 0 && !episodesLoading ? (
          <div className="py-8 text-center text-xs text-muted">
            暂无可列出的公开分集
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {episodes.map((ep) => (
              <button
                key={ep.id}
                onClick={() => onPlayEpisode(ep.id, ep.number)}
                disabled={!ep.playable}
                className={`relative p-2.5 rounded-xl text-center border transition-all flex flex-col items-center justify-center group ${
                  ep.playable
                    ? 'bg-surface hover:bg-surface-hover hover:border-primary active:bg-primary/30 border-border/80'
                    : 'bg-surface/30 opacity-50 border-border/40 cursor-not-allowed'
                }`}
              >
                <span className="text-xs font-bold text-gray-200 group-hover:text-primary transition-colors">
                  {ep.number}
                </span>
                {ep.isNew && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 游标分页“加载更多”按钮 */}
        {episodesHasMore && (
          <div className="pt-4 pb-2 text-center">
            <button
              onClick={loadMoreEpisodes}
              disabled={episodesLoading}
              className="px-4 py-2 bg-surface hover:bg-surface-hover active:bg-border text-xs text-gray-200 rounded-xl border border-border inline-flex items-center space-x-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${episodesLoading ? 'animate-spin text-primary' : 'text-muted'}`} />
              <span>{episodesLoading ? '正在加载后续分集...' : '加载下一页分集'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
