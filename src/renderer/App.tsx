import { useEffect, useState, useCallback } from 'react';
import { Compass, Trophy, Search, Bookmark, Info } from 'lucide-react';
import type { DramaSummary } from '../shared/types.js';
import { Navbar } from './components/Navbar.js';
import { EpisodeDrawer } from './components/EpisodeDrawer.js';
import { SearchModal } from './components/SearchModal.js';
import { PlayerModal } from './components/PlayerModal.js';
import { DiscoverView } from './views/DiscoverView.js';
import { RankingView } from './views/RankingView.js';
import { LibraryView } from './views/LibraryView.js';
import { SettingsView } from './views/SettingsView.js';
import { PiPPlayerView } from './views/PiPPlayerView.js';
import { useDramaStore } from './store/useDramaStore.js';
import { useLibraryStore } from './store/useLibraryStore.js';

type ActiveTab = 'discover' | 'ranking' | 'search' | 'library' | 'settings';

export default function App() {
  const isPiPMode =
    new URLSearchParams(window.location.search.replace(/^\?+/, '')).get('mode') === 'pip' ||
    new URLSearchParams(window.location.hash.slice(1).replace(/^\?+/, '')).get('mode') === 'pip';
  if (isPiPMode) {
    return <PiPPlayerView />;
  }

  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [searchCue, setSearchCue] = useState('');

  const [activePlayback, setActivePlayback] = useState<{
    drama: DramaSummary;
    episodeId: string;
    initialPosition?: number;
  } | null>(null);

  const { openDramaDetail, closeDramaDetail, selectedDrama, episodes } = useDramaStore();
  const { loadLibrary } = useLibraryStore();

  useEffect(() => {
    loadLibrary();

    // 随机取一个搜索提示词
    window.electronAPI.getHotSearch().then(({ searchCues }) => {
      if (searchCues.length > 0) {
        setSearchCue(searchCues[0]);
      }
    }).catch(() => {});

    // 监听从小窗 (PiP) 迁回主窗口的接力事件，恢复断点播放
    const unsubFromPiP = window.electronAPI.onHandoffFromPiP(async ({ session }) => {
      if (!session) return;
      try {
        const detail = await window.electronAPI.getDramaDetail(session.seriesId);
        if (detail) {
          await openDramaDetail(detail);
          setActivePlayback({
            drama: detail,
            episodeId: session.episodeId,
            initialPosition: session.positionSeconds,
          });
        }
      } catch (err) {
        console.warn('[App] Failed to resume session from PiP:', err);
      }
    });

    return () => {
      unsubFromPiP();
    };
  }, [loadLibrary, openDramaDetail]);

  // 全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePin();
      } else if (e.key === 'Escape') {
        if (activePlayback) {
          handleClosePlayer();
        } else if (selectedDrama) {
          closeDramaDetail();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDrama, activePlayback, closeDramaDetail]);

  const handleTogglePin = async () => {
    const nextState = await window.electronAPI.toggleAlwaysOnTop();
    setIsAlwaysOnTop(nextState);
  };

  const handlePlayEpisode = (episodeId: string) => {
    if (!selectedDrama) return;
    setActivePlayback({
      drama: selectedDrama,
      episodeId,
      initialPosition: 0,
    });
  };

  const handleResumeHistory = async (seriesId: string, episodeId: string, _num: number, position: number) => {
    try {
      const detail = await window.electronAPI.getDramaDetail(seriesId);
      if (detail) {
        await openDramaDetail(detail);
        setActivePlayback({
          drama: detail,
          episodeId,
          initialPosition: position,
        });
      }
    } catch (err) {
      console.warn('[App] Failed to resume history:', err);
    }
  };

  const handleClosePlayer = useCallback(async () => {
    setActivePlayback(null);
    await loadLibrary();
  }, [loadLibrary]);

  const handleSelectDrama = (drama: DramaSummary) => {
    openDramaDetail(drama);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-gray-100 overflow-hidden select-none font-sans">
      {/* 顶部标题栏 */}
      <Navbar isAlwaysOnTop={isAlwaysOnTop} onTogglePin={handleTogglePin} />

      {/* 主视图区 */}
      <div className="flex-1 overflow-hidden relative">
        <main className="h-full overflow-y-auto no-scrollbar p-4 pb-20">
          {activeTab === 'discover' && (
            <DiscoverView
              onSelectDrama={handleSelectDrama}
              onOpenSearch={() => setActiveTab('search')}
              searchCue={searchCue}
            />
          )}

          {activeTab === 'ranking' && (
            <RankingView onSelectDrama={handleSelectDrama} />
          )}

          {activeTab === 'search' && (
            <SearchModal onSelectDrama={handleSelectDrama} />
          )}

          {activeTab === 'library' && (
            <LibraryView
              onSelectDrama={handleSelectDrama}
              onPlayEpisode={handleResumeHistory}
            />
          )}

          {activeTab === 'settings' && <SettingsView />}
        </main>

        {/* 选集与详情抽屉 */}
        <EpisodeDrawer onPlayEpisode={(epId) => handlePlayEpisode(epId)} />

        {/* 短剧专属沉浸播放视窗 */}
        {activePlayback && (
          <PlayerModal
            drama={activePlayback.drama}
            episodes={episodes}
            initialEpisodeId={activePlayback.episodeId}
            initialPosition={activePlayback.initialPosition}
            onClose={handleClosePlayer}
            onSwitchEpisode={(epId) => {
              setActivePlayback((prev) => (prev ? { ...prev, episodeId: epId, initialPosition: 0 } : null));
            }}
          />
        )}
      </div>

      {/* 底部导航栏 */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-surface/90 backdrop-blur-md border-t border-border flex items-center justify-around px-2 z-30 select-none">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'discover' ? 'text-primary font-medium' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Compass className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">发现</span>
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'ranking' ? 'text-amber-400 font-medium' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Trophy className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">榜单</span>
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'search' ? 'text-primary font-medium' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Search className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">搜索</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'library' ? 'text-primary font-medium' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Bookmark className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">追剧</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'settings' ? 'text-primary font-medium' : 'text-muted hover:text-gray-300'
          }`}
        >
          <Info className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">关于</span>
        </button>
      </nav>
    </div>
  );
}
