import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Flame, ChevronRight, RefreshCw, Film } from 'lucide-react';
import type { DramaSummary, RankDramaItem } from '../../shared/types.js';
import { EmptyState } from '../components/EmptyState.js';

interface RankingViewProps {
  onSelectDrama: (drama: DramaSummary) => void;
}

const RANK_TABS = [
  { id: 'all', label: '热播总榜' },
  { id: 'human', label: '真人剧榜' },
  { id: 'comic_series_rank', label: '动态漫榜' },
  { id: 'ai_playlet', label: 'AI短剧榜' },
  { id: 'series_album', label: '合集多季' },
];

export const RankingView: React.FC<RankingViewProps> = ({ onSelectDrama }) => {
  const [currentTab, setCurrentTab] = useState('all');
  const [items, setItems] = useState<RankDramaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeRequestId = useRef(0);

  const loadRanking = async (tab: string) => {
    const requestId = ++activeRequestId.current;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await window.electronAPI.getShortRank({
        content: tab === 'all' ? undefined : tab,
      });

      if (activeRequestId.current !== requestId) return;
      setItems(res.items);
    } catch (err: any) {
      if (activeRequestId.current === requestId) {
        setErrorMsg(err.message || '加载榜单数据失败');
      }
    } finally {
      if (activeRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadRanking(currentTab);
  }, [currentTab]);

  const handleItemClick = (item: RankDramaItem) => {
    if (!item.seriesId) return;
    onSelectDrama({
      id: item.seriesId,
      title: item.title,
      description: item.description || '',
      coverUrl: item.coverUrl,
      episodeCount: item.episodeCount || 0,
    });
  };

  const getRankBadgeColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-amber-400 text-black font-extrabold shadow-md';
      case 2:
        return 'bg-slate-300 text-black font-bold';
      case 3:
        return 'bg-amber-600 text-white font-bold';
      default:
        return 'bg-surface-hover text-muted font-medium';
    }
  };

  return (
    <div className="space-y-3.5 select-none">
      {/* 顶部标题与图标 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-100 flex items-center">
          <Trophy className="w-4 h-4 text-amber-400 mr-1.5" />
          全网短剧风云榜
        </h2>
        <button
          onClick={() => loadRanking(currentTab)}
          disabled={isLoading}
          className="text-[11px] text-muted hover:text-gray-200 flex items-center space-x-1"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-primary' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {/* 榜单分类选项卡 */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
        {RANK_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id)}
            className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap font-medium transition-all ${
              currentTab === tab.id
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-surface hover:bg-surface-hover text-muted hover:text-gray-200 border border-border/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* 榜单列表 */}
      {items.length === 0 && !isLoading ? (
        <EmptyState
          title="暂无榜单数据"
          description="该榜单暂未返回排行数据，请切换其他榜单分类或刷新"
          onRetry={() => loadRanking(currentTab)}
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const rankNumber = item.rank || idx + 1;
            return (
              <div
                key={item.seriesId || idx}
                onClick={() => handleItemClick(item)}
                className="group flex items-center p-2.5 bg-card border border-border/70 hover:border-amber-500/50 rounded-xl cursor-pointer transition-all hover:shadow-md"
              >
                {/* 排名勋章 */}
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs mr-3 ${getRankBadgeColor(
                    rankNumber
                  )}`}
                >
                  {rankNumber}
                </span>

                {/* 海报封面 */}
                <div className="w-12 h-16 rounded-lg bg-surface-hover overflow-hidden relative mr-3 flex-shrink-0">
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted">
                      <Film className="w-5 h-5 opacity-40" />
                    </div>
                  )}
                </div>

                {/* 文本信息 */}
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="font-semibold text-xs text-gray-100 line-clamp-1 group-hover:text-amber-400 transition-colors">
                    {item.title}
                  </h4>
                  <div className="flex items-center space-x-2 mt-1 text-[11px] text-muted">
                    {item.actor && <span className="line-clamp-1">{item.actor}</span>}
                    {item.episodeCount && <span>全 {item.episodeCount} 集</span>}
                  </div>
                </div>

                {/* 热度分值 */}
                <div className="flex items-center space-x-1 text-right flex-shrink-0">
                  {item.score && (
                    <span className="text-xs font-semibold text-accent flex items-center">
                      <Flame className="w-3 h-3 mr-0.5 fill-accent" />
                      {item.score}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted group-hover:text-amber-400 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
