import React, { useState, useEffect, useRef } from 'react';
import { Flame, RefreshCw, ChevronDown } from 'lucide-react';
import type { DramaSummary } from '../../shared/types.js';
import { DramaCard } from '../components/DramaCard.js';
import { EmptyState } from '../components/EmptyState.js';

interface DiscoverViewProps {
  onSelectDrama: (drama: DramaSummary) => void;
  onOpenSearch: () => void;
  searchCue?: string;
}

const CHANNELS = [
  { id: '', label: '精选推荐' },
  { id: 'hot', label: '短剧榜单' },
  { id: 'new', label: '新剧抢先' },
  { id: 'female', label: '女生偏好' },
  { id: 'male', label: '男生热血' },
  { id: 'comic', label: '动态漫剧' },
];

export const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectDrama, onOpenSearch, searchCue }) => {
  const [currentChannel, setCurrentChannel] = useState('');
  const [dramas, setDramas] = useState<DramaSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 请求时序防竞态
  const activeRequestId = useRef(0);

  const fetchDramas = async (channel: string, reset = true) => {
    const requestId = ++activeRequestId.current;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const nextCursor = reset ? undefined : cursor;
      const res = await window.electronAPI.getDiscover({
        channel,
        cursor: nextCursor,
      });

      // 防竞态检查
      if (activeRequestId.current !== requestId) return;

      if (reset) {
        setDramas(res.items);
      } else {
        // 去重合并
        const existingIds = new Set(dramas.map((d) => d.id));
        const newDramas = res.items.filter((d) => !existingIds.has(d.id));
        setDramas((prev) => [...prev, ...newDramas]);
      }

      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (activeRequestId.current === requestId) {
        setErrorMsg(err.message || '加载推荐流失败，请检查网络');
      }
    } finally {
      if (activeRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDramas(currentChannel, true);
  }, [currentChannel]);

  return (
    <div className="space-y-3.5">
      {/* 搜索框入口条 */}
      <div
        onClick={onOpenSearch}
        className="flex items-center w-full px-3.5 py-2.5 bg-surface hover:bg-surface-hover border border-border rounded-xl cursor-pointer transition-colors shadow-sm"
      >
        <span className="text-xs text-muted flex-1 line-clamp-1">
          {searchCue ? `搜你想看：${searchCue}` : '搜索全网短剧、题材、主角...'}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 bg-card border border-border/80 text-muted rounded">
          回车搜
        </span>
      </div>

      {/* 频道横向滑动标签 */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setCurrentChannel(ch.id)}
            className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap font-medium transition-all ${
              currentChannel === ch.id
                ? 'bg-primary text-white shadow-md'
                : 'bg-surface hover:bg-surface-hover text-muted hover:text-gray-200 border border-border/60'
            }`}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* 标题栏与刷新 */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-xs font-bold text-gray-200 flex items-center">
          <Flame className="w-3.5 h-3.5 text-accent mr-1 fill-accent" />
          <span>{CHANNELS.find((c) => c.id === currentChannel)?.label || '短剧推荐'}</span>
        </h2>
        <button
          onClick={() => fetchDramas(currentChannel, true)}
          disabled={isLoading}
          className="text-[11px] text-muted hover:text-gray-200 flex items-center space-x-1"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-primary' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* 瀑布流列表 */}
      {dramas.length === 0 && !isLoading ? (
        <EmptyState
          title="暂无频道内容"
          description="该频道当前未返回推荐数据，建议刷新或切换至精选推荐频道"
          onRetry={() => fetchDramas(currentChannel, true)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {dramas.map((drama) => (
            <DramaCard key={drama.id} drama={drama} onClick={onSelectDrama} />
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && (
        <div className="pt-3 text-center">
          <button
            onClick={() => fetchDramas(currentChannel, false)}
            disabled={isLoading}
            className="px-4 py-2 bg-surface hover:bg-surface-hover active:bg-border text-xs text-gray-200 rounded-xl border border-border inline-flex items-center space-x-1.5 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 ${isLoading ? 'animate-bounce' : 'text-muted'}`} />
            <span>{isLoading ? '加载更多中...' : '加载下一页短剧'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
