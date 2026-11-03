import { useEffect, useState } from 'react';
import {
  Compass,
  Search,
  Bookmark,
  History,
  Pin,
  X,
  ChevronRight,
  Flame,
  Film,
  RefreshCw,
  Info,
} from 'lucide-react';
import type { DramaSummary, EpisodeItem, WatchHistoryItem, FavoriteItem, SystemDiagnostics } from '../shared/types.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<'discover' | 'search' | 'library' | 'settings'>('discover');
  const [dramas, setDramas] = useState<DramaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCues, setSearchCues] = useState<string[]>([]);
  const [currentCueIndex, setCurrentCueIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [hotQueries, setHotQueries] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<DramaSummary[]>([]);

  // 详情与选集抽屉状态
  const [selectedDrama, setSelectedDrama] = useState<DramaSummary | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesNextCursor, setEpisodesNextCursor] = useState<string | undefined>();
  const [episodesHasMore, setEpisodesHasMore] = useState(false);

  // 历史与收藏状态
  const [historyList, setHistoryList] = useState<WatchHistoryItem[]>([]);
  const [favoriteList, setFavoriteList] = useState<FavoriteItem[]>([]);

  // 窗口与诊断
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);

  // 1. 初始化拉取发现数据与热搜词
  useEffect(() => {
    loadDiscover();
    loadHotSearch();
    loadLibrary();
  }, []);

  // 2. 搜索框提示词轮播 (每 4 秒)
  useEffect(() => {
    if (searchCues.length === 0) return;
    const timer = setInterval(() => {
      setCurrentCueIndex((prev) => (prev + 1) % searchCues.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [searchCues]);

  // 3. 搜索联想输入防抖 (300ms)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.getSearchSuggestions(searchQuery.trim());
        setSuggestions(res);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 加载发现推荐
  const loadDiscover = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.getDiscover();
      setDramas(res.items);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '加载推荐流失败，请检查网络或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 加载热搜
  const loadHotSearch = async () => {
    try {
      const { hotQueries, searchCues } = await window.electronAPI.getHotSearch();
      setHotQueries(hotQueries);
      setSearchCues(searchCues);
    } catch {
      // 容错处理
    }
  };

  // 加载本地历史与收藏
  const loadLibrary = async () => {
    try {
      const [hist, favs] = await Promise.all([
        window.electronAPI.getHistory(),
        window.electronAPI.getFavorites(),
      ]);
      setHistoryList(hist);
      setFavoriteList(favs);
    } catch (err) {
      console.error(err);
    }
  };

  // 执行搜索
  const handleSearch = async (keyword: string) => {
    if (!keyword.trim()) return;
    setSearchQuery(keyword);
    setSuggestions([]);
    setActiveTab('search');
    setLoading(true);
    try {
      const res = await window.electronAPI.searchDramas(keyword.trim());
      setSearchResults(res.items);
    } catch (err: any) {
      setErrorMsg(err.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开短剧详情与选集抽屉
  const handleOpenDetail = async (drama: DramaSummary) => {
    setSelectedDrama(drama);
    setEpisodesLoading(true);
    setEpisodes([]);
    try {
      const detail = await window.electronAPI.getDramaDetail(drama.id);
      if (detail) setSelectedDrama(detail);

      const epRes = await window.electronAPI.getEpisodes(drama.id, { pageSize: 30 });
      setEpisodes(epRes.items);
      setEpisodesNextCursor(epRes.cursor);
      setEpisodesHasMore(epRes.hasMore);
    } catch (err: any) {
      console.error(err);
    } finally {
      setEpisodesLoading(false);
    }
  };

  // 加载下一页分集 (游标分页)
  const handleLoadMoreEpisodes = async () => {
    if (!selectedDrama || !episodesNextCursor || episodesLoading) return;
    setEpisodesLoading(true);
    try {
      const epRes = await window.electronAPI.getEpisodes(selectedDrama.id, {
        cursor: episodesNextCursor,
        pageSize: 30,
      });
      setEpisodes((prev) => [...prev, ...epRes.items]);
      setEpisodesNextCursor(epRes.cursor);
      setEpisodesHasMore(epRes.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setEpisodesLoading(false);
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = async (drama: DramaSummary) => {
    try {
      await window.electronAPI.toggleFavorite({
        seriesId: drama.id,
        seriesTitle: drama.title,
        cachedCoverUrl: drama.coverUrl,
        cachedCoverExpiresAt: drama.coverExpiresAt,
        episodeCount: drama.episodeCount,
        addedAt: Date.now(),
      });
      await loadLibrary();
    } catch (err) {
      console.error(err);
    }
  };

  // 置顶摸鱼小窗切换
  const handleTogglePin = async () => {
    const nextState = await window.electronAPI.toggleAlwaysOnTop();
    setIsAlwaysOnTop(nextState);
  };

  // 打开系统诊断
  const handleOpenDiagnostics = async () => {
    setActiveTab('settings');
    const diag = await window.electronAPI.getDiagnostics();
    setDiagnostics(diag);
  };

  const isFavorited = (seriesId: string) => favoriteList.some((f) => f.seriesId === seriesId);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-gray-100 overflow-hidden select-none">
      {/* 顶部标题栏 & 拖拽区 */}
      <header className="drag-region flex items-center justify-between px-4 py-2 bg-surface/80 backdrop-blur-md border-b border-border z-30">
        <div className="flex items-center space-x-2 pl-16">
          <Film className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-wide text-sm bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
            OhMyHongguo
          </span>
        </div>

        {/* 顶部右侧工具按钮 */}
        <div className="no-drag flex items-center space-x-1">
          <button
            onClick={handleTogglePin}
            title={isAlwaysOnTop ? '取消置顶小窗' : '置顶小窗摸鱼模式 (P)'}
            className={`p-1.5 rounded-lg transition-colors ${
              isAlwaysOnTop ? 'bg-primary/20 text-primary' : 'text-muted hover:text-gray-200 hover:bg-surface-hover'
            }`}
          >
            <Pin className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 主体交互区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 内容展示区 */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-4 pb-20">
          {/* 发现流频道 */}
          {activeTab === 'discover' && (
            <div className="space-y-4">
              {/* 搜索框快捷入口 */}
              <div className="relative">
                <div
                  onClick={() => setActiveTab('search')}
                  className="flex items-center w-full px-3 py-2 bg-surface hover:bg-surface-hover border border-border rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  <Search className="w-4 h-4 text-muted mr-2" />
                  <span className="text-sm text-muted">
                    {searchCues.length > 0 ? `搜你想看：${searchCues[currentCueIndex]}` : '搜索剧名、主角、题材...'}
                  </span>
                </div>
              </div>

              {/* 头部标题与刷新 */}
              <div className="flex items-center justify-between pt-1">
                <h2 className="text-base font-bold text-gray-200 flex items-center">
                  <Flame className="w-4 h-4 text-accent mr-1.5" />
                  精选短剧推荐
                </h2>
                <button
                  onClick={loadDiscover}
                  disabled={loading}
                  className="text-xs text-muted hover:text-gray-200 flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>刷新</span>
                </button>
              </div>

              {/* 错误提示 */}
              {errorMsg && (
                <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300">
                  {errorMsg}
                </div>
              )}

              {/* 短剧卡片瀑布流 */}
              <div className="grid grid-cols-2 gap-3">
                {dramas.map((drama) => (
                  <div
                    key={drama.id}
                    onClick={() => handleOpenDetail(drama)}
                    className="group relative bg-card border border-border/60 hover:border-border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg flex flex-col"
                  >
                    {/* 封面海报 */}
                    <div className="relative aspect-[3/4] w-full bg-surface-hover overflow-hidden">
                      {drama.coverUrl ? (
                        <img
                          src={drama.coverUrl}
                          alt={drama.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted">
                          <Film className="w-8 h-8 opacity-40" />
                        </div>
                      )}

                      {/* 完结/更新状态角标 */}
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 backdrop-blur-md rounded text-[10px] font-medium text-gray-200">
                        {drama.statusText || (drama.episodeCount ? `全 ${drama.episodeCount} 集` : '短剧')}
                      </span>

                      {/* 题材标签 */}
                      {drama.category && (
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-primary/80 backdrop-blur-md rounded text-[10px] font-semibold text-white">
                          {drama.category}
                        </span>
                      )}
                    </div>

                    {/* 卡片详情 */}
                    <div className="p-2.5 flex flex-col flex-1 justify-between">
                      <h3 className="font-semibold text-xs text-gray-100 line-clamp-1 group-hover:text-primary transition-colors">
                        {drama.title}
                      </h3>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted">
                        <span>{drama.author || '热播短剧'}</span>
                        {drama.heat && (
                          <span className="flex items-center text-accent">
                            <Flame className="w-2.5 h-2.5 mr-0.5" />
                            {Math.round(drama.heat / 10000)}万
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 搜索视图 */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                  placeholder="搜索短剧、主角、题材..."
                  autoFocus
                  className="w-full px-3 py-2 pl-9 pr-8 bg-surface border border-border rounded-xl text-sm text-gray-100 placeholder-muted focus:outline-none focus:border-primary"
                />
                <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-muted hover:text-gray-200">
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* 实时输入联想 */}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-20">
                    {suggestions.map((sug, i) => (
                      <div
                        key={i}
                        onClick={() => handleSearch(sug)}
                        className="px-3 py-2 text-xs hover:bg-surface-hover cursor-pointer border-b border-border/40 last:border-b-0 flex items-center justify-between"
                      >
                        <span>{sug}</span>
                        <ChevronRight className="w-3 h-3 text-muted" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 热搜榜 */}
              {searchResults.length === 0 && hotQueries.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-muted flex items-center">
                    <Flame className="w-3 h-3 text-accent mr-1" />
                    全网短剧热搜榜
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {hotQueries.map((query, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSearch(query)}
                        className="px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border/60 rounded-lg text-xs text-gray-300 transition-colors"
                      >
                        <span className={`mr-1 font-bold ${idx < 3 ? 'text-accent' : 'text-muted'}`}>
                          {idx + 1}.
                        </span>
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 搜索结果列表 */}
              {searchResults.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {searchResults.map((drama) => (
                    <div
                      key={drama.id}
                      onClick={() => handleOpenDetail(drama)}
                      className="group bg-card border border-border/60 hover:border-border rounded-xl overflow-hidden cursor-pointer"
                    >
                      <div className="aspect-[3/4] bg-surface-hover">
                        {drama.coverUrl ? (
                          <img src={drama.coverUrl} alt={drama.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted">
                            <Film className="w-8 h-8 opacity-40" />
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <h4 className="font-semibold text-xs text-gray-100 line-clamp-1">{drama.title}</h4>
                        <span className="text-[10px] text-muted">共 {drama.episodeCount} 集</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 追剧与历史视图 */}
          {activeTab === 'library' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-200 flex items-center">
                <Bookmark className="w-4 h-4 text-primary mr-1.5" />
                我的追剧收藏 ({favoriteList.length})
              </h3>
              {favoriteList.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted bg-surface/50 rounded-xl border border-border">
                  暂无追剧收藏，在短剧详情中点击收藏即可随时追踪更新
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {favoriteList.map((fav) => (
                    <div
                      key={fav.seriesId}
                      onClick={() => handleOpenDetail({ id: fav.seriesId, title: fav.seriesTitle, description: '', coverUrl: fav.cachedCoverUrl || '', episodeCount: fav.episodeCount })}
                      className="bg-card border border-border/60 hover:border-border rounded-xl p-2 cursor-pointer"
                    >
                      <h4 className="font-semibold text-xs text-gray-100 line-clamp-1">{fav.seriesTitle}</h4>
                      <span className="text-[10px] text-muted">共 {fav.episodeCount} 集</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-200 flex items-center">
                  <History className="w-4 h-4 text-accent mr-1.5" />
                  观看历史 (秒级断点续播)
                </h3>
                {historyList.length > 0 && (
                  <button
                    onClick={async () => {
                      await window.electronAPI.clearHistory();
                      await loadLibrary();
                    }}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    清空
                  </button>
                )}
              </div>
              {historyList.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted bg-surface/50 rounded-xl border border-border">
                  暂无观看历史
                </div>
              ) : (
                <div className="space-y-2">
                  {historyList.map((hist) => (
                    <div
                      key={hist.seriesId}
                      className="flex items-center justify-between p-2.5 bg-card border border-border/60 rounded-xl"
                    >
                      <div className="flex-1 pr-2">
                        <h4 className="font-semibold text-xs text-gray-100 line-clamp-1">{hist.seriesTitle}</h4>
                        <span className="text-[10px] text-muted">
                          上次看到第 {hist.episodeNumber} 集 · {Math.floor(hist.positionSeconds / 60)}:
                          {Math.floor(hist.positionSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <button className="p-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs">
                        续播
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 设置与诊断视图 */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-200 flex items-center">
                <Info className="w-4 h-4 text-primary mr-1.5" />
                系统运行与诊断信息
              </h3>
              {diagnostics && (
                <div className="p-3 bg-card border border-border rounded-xl text-xs space-y-2 text-gray-300">
                  <div>
                    <span className="text-muted">应用版本:</span> {diagnostics.appVersion}
                  </div>
                  <div>
                    <span className="text-muted">Electron 内核:</span> {diagnostics.electronVersion} (稳定主版本)
                  </div>
                  <div>
                    <span className="text-muted">Node.js 运行时:</span> {diagnostics.nodeVersion}
                  </div>
                  <div>
                    <span className="text-muted">系统架构:</span> {diagnostics.platform}
                  </div>
                  <div className="break-all">
                    <span className="text-muted">匿名设备档案:</span> {diagnostics.profilePath}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* 选集与详情右侧抽屉 (Drawer) */}
        {selectedDrama && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-md z-40 flex flex-col p-4 animate-in fade-in duration-200">
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex-1 pr-2">
                <h3 className="font-bold text-sm text-gray-100 line-clamp-1">{selectedDrama.title}</h3>
                <span className="text-[11px] text-muted">
                  {selectedDrama.episodeCount ? `全 ${selectedDrama.episodeCount} 集` : '短剧详情'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleToggleFavorite(selectedDrama)}
                  className={`p-1.5 rounded-lg border text-xs flex items-center space-x-1 ${
                    isFavorited(selectedDrama.id)
                      ? 'bg-primary/20 text-primary border-primary/30'
                      : 'border-border text-muted hover:text-gray-200'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{isFavorited(selectedDrama.id) ? '已追' : '追剧'}</span>
                </button>
                <button
                  onClick={() => setSelectedDrama(null)}
                  className="p-1.5 text-muted hover:text-gray-200 rounded-lg hover:bg-surface-hover"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 剧情简介 */}
            {selectedDrama.description && (
              <p className="text-xs text-muted py-2 line-clamp-3 leading-relaxed border-b border-border/40">
                {selectedDrama.description}
              </p>
            )}

            {/* 分集网格 (真实游标分页加载) */}
            <div className="flex-1 overflow-y-auto no-scrollbar py-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-semibold text-gray-300">
                  选集列表 ({episodes.length} / {selectedDrama.episodeCount || episodes.length})
                </span>
                {episodesLoading && <RefreshCw className="w-3 h-3 text-muted animate-spin" />}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {episodes.map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => {
                      // 阶段 3 播放器接入点
                      alert(`正在唤起第 ${ep.number} 集 (ID: ${ep.id}) · 遵循阶段 0 决策门槛`);
                    }}
                    className="p-2.5 bg-surface hover:bg-surface-hover active:bg-primary border border-border/80 rounded-xl text-center transition-all group"
                  >
                    <span className="text-xs font-bold text-gray-200 group-hover:text-primary">
                      {ep.number}
                    </span>
                  </button>
                ))}
              </div>

              {/* 游标分页“加载更多” */}
              {episodesHasMore && (
                <div className="pt-3 text-center">
                  <button
                    onClick={handleLoadMoreEpisodes}
                    disabled={episodesLoading}
                    className="px-4 py-1.5 bg-surface-hover hover:bg-border text-xs text-gray-300 rounded-xl border border-border"
                  >
                    {episodesLoading ? '加载中...' : '加载更多集数 (Cursor)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部导航栏 */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-surface/90 backdrop-blur-md border-t border-border flex items-center justify-around px-2 z-30">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'discover' ? 'text-primary' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Compass className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">发现</span>
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'search' ? 'text-primary' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Search className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">搜索</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'library' ? 'text-primary' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Bookmark className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">追剧</span>
        </button>
        <button
          onClick={handleOpenDiagnostics}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'settings' ? 'text-primary' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Info className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">诊断</span>
        </button>
      </nav>
    </div>
  );
}
