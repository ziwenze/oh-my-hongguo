import { useEffect, useState } from 'react';
import { Compass, Trophy, Search, Bookmark, Info } from 'lucide-react';
import type { DramaSummary } from '../shared/types.js';
import { Navbar } from './components/Navbar.js';
import { EpisodeDrawer } from './components/EpisodeDrawer.js';
import { SearchModal } from './components/SearchModal.js';
import { DiscoverView } from './views/DiscoverView.js';
import { RankingView } from './views/RankingView.js';
import { LibraryView } from './views/LibraryView.js';
import { SettingsView } from './views/SettingsView.js';
import { useDramaStore } from './store/useDramaStore.js';
import { useLibraryStore } from './store/useLibraryStore.js';

type ActiveTab = 'discover' | 'ranking' | 'search' | 'library' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [searchCue, setSearchCue] = useState('');

  const { openDramaDetail, closeDramaDetail, selectedDrama } = useDramaStore();
  const { loadLibrary } = useLibraryStore();

  useEffect(() => {
    loadLibrary();

    // 随机取一个搜索提示词
    window.electronAPI.getHotSearch().then(({ searchCues }) => {
      if (searchCues.length > 0) {
        setSearchCue(searchCues[0]);
      }
    }).catch(() => {});
  }, [loadLibrary]);

  // 全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框内的按键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePin();
      } else if (e.key === 'Escape') {
        if (selectedDrama) {
          closeDramaDetail();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDrama, closeDramaDetail]);

  const handleTogglePin = async () => {
    const nextState = await window.electronAPI.toggleAlwaysOnTop();
    setIsAlwaysOnTop(nextState);
  };

  const handlePlayEpisode = (episodeId: string, episodeNumber: number) => {
    // 阶段 3 准入与环境说明提示
    alert(`[阶段 0 决策门槛准入提示]\n正在请求分集：第 ${episodeNumber} 集 (ID: ${episodeId})\n依据 AGENTS.md 规范，媒体播放引擎正按阶段 0 准入要求进行兼容性与授权评估。`);
  };

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
              onPlayEpisode={(_, epId, num) => handlePlayEpisode(epId, num)}
            />
          )}

          {activeTab === 'settings' && <SettingsView />}
        </main>

        {/* 选集与详情抽屉 */}
        <EpisodeDrawer onPlayEpisode={handlePlayEpisode} />
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
