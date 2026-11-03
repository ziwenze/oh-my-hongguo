import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Flame, ChevronRight, History, Trash2 } from 'lucide-react';
import type { DramaSummary, SearchSuggestionItem } from '../../shared/types.js';
import { DramaCard } from './DramaCard.js';
import { EmptyState } from './EmptyState.js';

interface SearchModalProps {
  onSelectDrama: (drama: DramaSummary) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ onSelectDrama }) => {
  const [query, setQuery] = useState('');
  const [searchCues, setSearchCues] = useState<string[]>([]);
  const [currentCueIndex, setCurrentCueIndex] = useState(0);
  const [hotQueries, setHotQueries] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [results, setResults] = useState<DramaSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // 防竞态请求 ID 计数器
  const activeSuggestRequestId = useRef(0);
  const activeSearchRequestId = useRef(0);

  // 初始化拉取热搜与轮播提示词
  useEffect(() => {
    window.electronAPI.getHotSearch().then(({ hotQueries, searchCues }) => {
      setHotQueries(hotQueries);
      setSearchCues(searchCues);
    }).catch(() => {});

    // 从 localStorage 读取本地搜索历史
    try {
      const local = localStorage.getItem('ohg_search_history');
      if (local) setSearchHistory(JSON.parse(local));
    } catch {}
  }, []);

  // 4 秒轮播热词提示
  useEffect(() => {
    if (searchCues.length === 0) return;
    const timer = setInterval(() => {
      setCurrentCueIndex((prev) => (prev + 1) % searchCues.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [searchCues]);

  // 300ms 防抖联想输入 (带请求竞态防护)
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    const requestId = ++activeSuggestRequestId.current;
    const timer = setTimeout(async () => {
      try {
        const items = await window.electronAPI.getSearchSuggestions(query.trim());
        // 防竞态检查：若非最新请求，放弃旧结果
        if (activeSuggestRequestId.current !== requestId) return;
        setSuggestions(items);
      } catch {
        if (activeSuggestRequestId.current === requestId) {
          setSuggestions([]);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // 执行搜索
  const executeSearch = async (keyword: string) => {
    if (!keyword.trim()) return;
    const finalKeyword = keyword.trim();
    setQuery(finalKeyword);
    setSuggestions([]);
    setIsLoading(true);
    setHasSearched(true);

    // 记录搜索历史 (去重并限制最多 10 条)
    const nextHistory = [finalKeyword, ...searchHistory.filter((k) => k !== finalKeyword)].slice(0, 10);
    setSearchHistory(nextHistory);
    try {
      localStorage.setItem('ohg_search_history', JSON.stringify(nextHistory));
    } catch {}

    const searchId = ++activeSearchRequestId.current;
    try {
      const page = await window.electronAPI.searchDramas(finalKeyword);
      // 防竞态检查
      if (activeSearchRequestId.current !== searchId) return;
      setResults(page.items);
    } catch (err) {
      if (activeSearchRequestId.current === searchId) {
        setResults([]);
      }
    } finally {
      if (activeSearchRequestId.current === searchId) {
        setIsLoading(false);
      }
    }
  };

  const removeHistoryItem = (keyword: string) => {
    const next = searchHistory.filter((k) => k !== keyword);
    setSearchHistory(next);
    try {
      localStorage.setItem('ohg_search_history', JSON.stringify(next));
    } catch {}
  };

  const clearAllHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('ohg_search_history');
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* 搜索输入框 */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && executeSearch(query)}
          placeholder={searchCues.length > 0 ? `搜你想看：${searchCues[currentCueIndex]}` : '搜索剧名、主角、题材...'}
          autoFocus
          className="w-full px-3.5 py-2.5 pl-10 pr-9 bg-surface border border-border focus:border-primary rounded-xl text-sm text-gray-100 placeholder-muted focus:outline-none transition-colors shadow-sm"
        />
        <Search className="w-4 h-4 text-muted absolute left-3.5 top-3" />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setSuggestions([]);
            }}
            className="absolute right-3 top-3 text-muted hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* 实时搜索联想下拉浮层 */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-20">
            {suggestions.map((sug, i) => (
              <div
                key={i}
                onClick={() => executeSearch(sug.keyword || sug.text)}
                className="px-3.5 py-2 text-xs hover:bg-surface-hover cursor-pointer border-b border-border/40 last:border-b-0 flex items-center justify-between transition-colors"
              >
                <span className="text-gray-200 font-medium">{sug.text}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted opacity-60" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 搜索历史 */}
      {!hasSearched && searchHistory.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted flex items-center">
              <History className="w-3.5 h-3.5 mr-1" />
              搜索历史
            </span>
            <button
              onClick={clearAllHistory}
              title="清空历史"
              className="text-[11px] text-muted hover:text-red-400 flex items-center space-x-0.5"
            >
              <Trash2 className="w-3 h-3" />
              <span>清空</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {searchHistory.map((k) => (
              <span
                key={k}
                onClick={() => executeSearch(k)}
                className="inline-flex items-center px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border/80 rounded-lg text-xs text-gray-300 cursor-pointer transition-colors group"
              >
                <span>{k}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeHistoryItem(k);
                  }}
                  className="ml-1.5 text-muted hover:text-gray-100 opacity-60 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 全网热搜总榜 */}
      {!hasSearched && hotQueries.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <span className="text-xs font-bold text-gray-300 flex items-center">
            <Flame className="w-3.5 h-3.5 text-accent mr-1 fill-accent" />
            全网短剧热搜榜
          </span>
          <div className="flex flex-wrap gap-2">
            {hotQueries.map((item, idx) => (
              <button
                key={idx}
                onClick={() => executeSearch(item)}
                className="px-3 py-1.5 bg-surface hover:bg-surface-hover active:bg-primary/20 border border-border/70 rounded-xl text-xs text-gray-200 transition-colors flex items-center"
              >
                <span className={`mr-1.5 font-bold ${idx < 3 ? 'text-accent' : 'text-muted'}`}>
                  {idx + 1}.
                </span>
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 搜索结果展示 */}
      {hasSearched && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>找到 {results.length} 部相关短剧</span>
            <button
              onClick={() => {
                setHasSearched(false);
                setResults([]);
                setQuery('');
              }}
              className="text-primary hover:underline"
            >
              返回热搜
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted">正在检索短剧中...</div>
          ) : results.length === 0 ? (
            <EmptyState
              title="未找到匹配的短剧"
              description={`尝试搜索其他关键词，例如都市、战神、甜宠或剧名的一部分`}
              onRetry={() => executeSearch(query)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {results.map((drama) => (
                <DramaCard key={drama.id} drama={drama} onClick={onSelectDrama} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
