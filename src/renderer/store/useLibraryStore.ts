import { create } from 'zustand';
import type { FavoriteItem, WatchHistoryItem } from '../../shared/types.js';

interface LibraryState {
  history: WatchHistoryItem[];
  favorites: FavoriteItem[];
  isLoading: boolean;
  loadLibrary: () => Promise<void>;
  toggleFavorite: (drama: { id: string; title: string; coverUrl?: string; coverExpiresAt?: string; episodeCount?: number }) => Promise<boolean>;
  clearHistory: () => Promise<void>;
  isFavorited: (seriesId: string) => boolean;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  history: [],
  favorites: [],
  isLoading: false,

  loadLibrary: async () => {
    set({ isLoading: true });
    try {
      const [hist, favs] = await Promise.all([
        window.electronAPI.getHistory(),
        window.electronAPI.getFavorites(),
      ]);
      set({ history: hist, favorites: favs });
    } catch (err) {
      console.error('[LibraryStore] Failed to load library data:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  toggleFavorite: async (drama) => {
    try {
      const isFav = await window.electronAPI.toggleFavorite({
        seriesId: drama.id,
        seriesTitle: drama.title,
        cachedCoverUrl: drama.coverUrl,
        cachedCoverExpiresAt: drama.coverExpiresAt,
        episodeCount: drama.episodeCount || 0,
        addedAt: Date.now(),
      });
      // 重新同步收藏列表
      const updatedFavs = await window.electronAPI.getFavorites();
      set({ favorites: updatedFavs });
      return isFav;
    } catch (err) {
      console.error('[LibraryStore] Failed to toggle favorite:', err);
      return false;
    }
  },

  clearHistory: async () => {
    try {
      await window.electronAPI.clearHistory();
      set({ history: [] });
    } catch (err) {
      console.error('[LibraryStore] Failed to clear history:', err);
    }
  },

  isFavorited: (seriesId: string) => {
    return get().favorites.some((f) => f.seriesId === seriesId);
  },
}));
