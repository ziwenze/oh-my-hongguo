import React, { useState } from 'react';
import { Film, Flame, Bookmark } from 'lucide-react';
import type { DramaSummary } from '../../shared/types.js';
import { useLibraryStore } from '../store/useLibraryStore.js';

interface DramaCardProps {
  drama: DramaSummary;
  onClick: (drama: DramaSummary) => void;
}

export const DramaCard: React.FC<DramaCardProps> = ({ drama, onClick }) => {
  const [imageError, setImageError] = useState(false);
  const { isFavorited, toggleFavorite } = useLibraryStore();
  const favorited = isFavorited(drama.id);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite({
      id: drama.id,
      title: drama.title,
      coverUrl: drama.coverUrl,
      coverExpiresAt: drama.coverExpiresAt,
      episodeCount: drama.episodeCount,
    });
  };

  return (
    <div
      onClick={() => onClick(drama)}
      className="group relative bg-card border border-border/60 hover:border-primary/50 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 flex flex-col"
    >
      {/* 封面区域 */}
      <div className="relative aspect-[3/4] w-full bg-surface-hover overflow-hidden">
        {drama.coverUrl && !imageError ? (
          <img
            src={drama.coverUrl}
            alt={drama.title}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted p-2 text-center bg-surface">
            <Film className="w-8 h-8 opacity-40 mb-1" />
            <span className="text-[10px] line-clamp-1 opacity-60">{drama.title}</span>
          </div>
        )}

        {/* 完结/更新状态角标 */}
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 backdrop-blur-md rounded text-[10px] font-medium text-gray-200 border border-white/10">
          {drama.statusText || (drama.episodeCount ? `全 ${drama.episodeCount} 集` : '短剧')}
        </span>

        {/* 题材标签 */}
        {drama.category && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-primary/80 backdrop-blur-md rounded text-[10px] font-semibold text-white shadow-sm">
            {drama.category}
          </span>
        )}

        {/* 悬停快捷操作：追剧按钮 */}
        <button
          onClick={handleFavoriteClick}
          title={favorited ? '取消追剧' : '追剧收藏'}
          className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-md transition-all ${
            favorited
              ? 'bg-primary text-white shadow-md'
              : 'bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-black/80'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 底部信息 */}
      <div className="p-2.5 flex flex-col flex-1 justify-between">
        <h3 className="font-semibold text-xs text-gray-100 line-clamp-1 group-hover:text-primary transition-colors">
          {drama.title}
        </h3>
        <div className="flex items-center justify-between mt-2 text-[10px] text-muted">
          <span className="line-clamp-1 max-w-[65%]">{drama.author || '热播推荐'}</span>
          {typeof drama.heat === 'number' && (
            <span className="flex items-center text-accent font-medium">
              <Flame className="w-2.5 h-2.5 mr-0.5 fill-accent" />
              {Math.round(drama.heat / 10000)}万
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
