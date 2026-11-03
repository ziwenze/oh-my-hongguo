import { create } from 'zustand';
import type { DramaSummary, EpisodeItem } from '../../shared/types.js';

interface DramaState {
  selectedDrama: DramaSummary | null;
  episodes: EpisodeItem[];
  episodesLoading: boolean;
  episodesCursor: string | undefined;
  episodesHasMore: boolean;
  // 当前活跃请求的时序 ID，防竞态覆盖
  activeRequestId: number;

  openDramaDetail: (drama: DramaSummary) => Promise<void>;
  closeDramaDetail: () => void;
  loadMoreEpisodes: () => Promise<void>;
}

export const useDramaStore = create<DramaState>((set, get) => ({
  selectedDrama: null,
  episodes: [],
  episodesLoading: false,
  episodesCursor: undefined,
  episodesHasMore: false,
  activeRequestId: 0,

  openDramaDetail: async (drama) => {
    const nextRequestId = Date.now();
    set({
      selectedDrama: drama,
      episodes: [],
      episodesLoading: true,
      episodesCursor: undefined,
      episodesHasMore: false,
      activeRequestId: nextRequestId,
    });

    try {
      const [detail, epPage] = await Promise.all([
        window.electronAPI.getDramaDetail(drama.id).catch(() => null),
        window.electronAPI.getEpisodes(drama.id, { pageSize: 30 }).catch(() => ({ items: [], hasMore: false, cursor: undefined })),
      ]);

      // 防竞态检查：若用户在此期间切换了剧集，放弃过期的响应结果
      if (get().activeRequestId !== nextRequestId) return;

      set({
        selectedDrama: detail || drama,
        episodes: epPage.items,
        episodesCursor: epPage.cursor,
        episodesHasMore: epPage.hasMore,
        episodesLoading: false,
      });
    } catch (err) {
      if (get().activeRequestId === nextRequestId) {
        set({ episodesLoading: false });
      }
      console.error('[DramaStore] Failed to open drama detail:', err);
    }
  },

  closeDramaDetail: () => {
    set({
      selectedDrama: null,
      episodes: [],
      episodesLoading: false,
      episodesCursor: undefined,
      episodesHasMore: false,
      activeRequestId: 0,
    });
  },

  loadMoreEpisodes: async () => {
    const { selectedDrama, episodesCursor, episodesLoading, episodesHasMore, activeRequestId } = get();
    if (!selectedDrama || !episodesCursor || episodesLoading || !episodesHasMore) return;

    set({ episodesLoading: true });
    try {
      const epPage = await window.electronAPI.getEpisodes(selectedDrama.id, {
        cursor: episodesCursor,
        pageSize: 30,
      });

      // 防竞态检查
      if (get().activeRequestId !== activeRequestId) return;

      // 去重追加
      const existingIds = new Set(get().episodes.map((e) => e.id));
      const newItems = epPage.items.filter((e) => !existingIds.has(e.id));

      set((state) => ({
        episodes: [...state.episodes, ...newItems],
        episodesCursor: epPage.cursor,
        episodesHasMore: epPage.hasMore,
        episodesLoading: false,
      }));
    } catch (err) {
      set({ episodesLoading: false });
      console.error('[DramaStore] Failed to load more episodes:', err);
    }
  },
}));
