import { createClient, fileProfileStore } from 'openhongguo';
import electron from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  DramaSummary,
  EpisodeItem,
  PageResult,
  PlaybackMediaSource,
  RankDramaItem,
  SearchSuggestionItem,
} from '../../shared/types.js';

const { app } = electron;

class SdkAdapter {
  private client: any = null;
  private clientInitPromise: Promise<any> | null = null;
  private profileDir: string;
  private profilePath: string;

  constructor() {
    this.profileDir = path.join(app.getPath('userData'), 'profile');
    this.profilePath = path.join(this.profileDir, 'anonymous.json');
  }

  // 并发安全的单例初始化 (共享 in-flight Promise)
  public async init(): Promise<void> {
    if (this.client) return;
    if (this.clientInitPromise) {
      await this.clientInitPromise;
      return;
    }

    this.clientInitPromise = (async () => {
      await fs.mkdir(this.profileDir, { recursive: true, mode: 0o700 });
      process.env.OHG_CONFIG_DIR = this.profileDir;
      const store = fileProfileStore(this.profilePath);
      this.client = await createClient({
        profile: store,
        retryAttempts: 2,
      });
      console.log('[SDK Adapter] Openhongguo Wasm client initialized safely at:', this.profilePath);
    })();

    try {
      await this.clientInitPromise;
    } finally {
      this.clientInitPromise = null;
    }
  }

  private async ensureClient(): Promise<any> {
    if (!this.client) {
      await this.init();
    }
    return this.client;
  }

  // 1. 发现推荐 (真实透传 channel 与 cursor)
  public async getDiscover(options?: { channel?: string; cursor?: string }): Promise<PageResult<DramaSummary>> {
    const client = await this.ensureClient();
    const res = await client.discover({
      channel: options?.channel && options.channel.trim() ? options.channel.trim() : undefined,
      cursor: options?.cursor,
    });

    const items: DramaSummary[] = (res.items || []).map((item: any) => ({
      id: String(item.id),
      title: String(item.title || ''),
      description: String(item.description || ''),
      coverUrl: String(item.cover_url || ''),
      coverExpiresAt: item.cover_expires_at,
      episodeCount: Number(item.episode_count || 0),
      author: item.author ? String(item.author) : undefined,
      category: item.category ? String(item.category) : undefined,
      heat: typeof item.heat === 'number' ? item.heat : undefined,
      statusText: item.right_text ? String(item.right_text) : undefined,
    }));

    return {
      items,
      cursor: res.cursor,
      hasMore: Boolean(res.has_more),
    };
  }

  // 2. 搜索短剧
  public async search(query: string, options?: { cursor?: string }): Promise<PageResult<DramaSummary>> {
    const client = await this.ensureClient();
    const res = await client.search(query, {
      cursor: options?.cursor,
    });

    const items: DramaSummary[] = (res.items || []).map((item: any) => ({
      id: String(item.id),
      title: String(item.title || ''),
      description: String(item.description || ''),
      coverUrl: String(item.cover_url || ''),
      coverExpiresAt: item.cover_expires_at,
      episodeCount: Number(item.episode_count || 0),
      author: item.author ? String(item.author) : undefined,
      category: item.category ? String(item.category) : undefined,
    }));

    return {
      items,
      cursor: res.cursor,
      hasMore: Boolean(res.has_more),
    };
  }

  // 3. 搜索联想 (精确映射 text 与 keyword)
  public async suggest(prefix: string): Promise<SearchSuggestionItem[]> {
    if (!prefix || !prefix.trim()) return [];
    const client = await this.ensureClient();
    const res = await client.suggest(prefix.trim());
    return (res || []).map((item: any) => ({
      text: String(item.text || item.title || item.keyword || ''),
      keyword: item.keyword ? String(item.keyword) : undefined,
    }));
  }

  // 4. 热搜与提示词
  public async getHotSearch(): Promise<{ hotQueries: string[]; searchCues: string[] }> {
    const client = await this.ensureClient();
    const [hot, cues] = await Promise.all([
      client.hotSearch().catch(() => ({ boards: [] })),
      client.searchCues().catch(() => []),
    ]);

    const hotQueries: string[] = [];
    if (hot && Array.isArray(hot.boards)) {
      for (const board of hot.boards) {
        if (Array.isArray(board.items)) {
          for (const item of board.items) {
            if (item.title) hotQueries.push(String(item.title));
          }
        }
      }
    }

    return {
      hotQueries: hotQueries.slice(0, 10),
      searchCues: Array.isArray(cues) ? cues.map(String) : [],
    };
  }

  // 5. 短剧详情
  public async getSeriesDetail(seriesId: string): Promise<DramaSummary | null> {
    const client = await this.ensureClient();
    const s = await client.getSeries(seriesId);
    if (!s) return null;
    return {
      id: String(s.id),
      title: String(s.title || ''),
      description: String(s.description || ''),
      coverUrl: String(s.cover_url || ''),
      coverExpiresAt: s.cover_expires_at,
      episodeCount: Number(s.episode_count || 0),
      author: s.author ? String(s.author) : undefined,
      category: s.category ? String(s.category) : undefined,
      heat: typeof s.heat === 'number' ? s.heat : undefined,
      statusText: s.right_text ? String(s.right_text) : undefined,
    };
  }

  // 6. 分集查询 (严格游标分页契约: { cursor, pageSize })
  public async listEpisodes(
    seriesId: string,
    options?: { cursor?: string; pageSize?: number }
  ): Promise<PageResult<EpisodeItem>> {
    const client = await this.ensureClient();
    const res = await client.listEpisodes(seriesId, {
      cursor: options?.cursor,
      pageSize: options?.pageSize || 30,
    });

    const items: EpisodeItem[] = (res.items || []).map((ep: any) => ({
      id: String(ep.id),
      seriesId: String(ep.series_id || seriesId),
      number: Number(ep.number || 0),
      title: String(ep.title || `第${ep.number}集`),
      playable: ep.playable !== false,
      isNew: Boolean(ep.is_new),
      coverUrl: ep.cover_url ? String(ep.cover_url) : undefined,
      coverExpiresAt: ep.cover_expires_at,
    }));

    return {
      items,
      cursor: res.cursor,
      hasMore: Boolean(res.has_more),
    };
  }

  // 7. 短剧榜单查询
  public async getShortRank(options?: {
    content?: string;
    board?: string;
    cursor?: string;
  }): Promise<PageResult<RankDramaItem>> {
    const client = await this.ensureClient();
    const res = await client.shortRank({
      content: options?.content && options.content.trim() ? options.content.trim() : undefined,
      board: options?.board && options.board.trim() ? options.board.trim() : undefined,
      cursor: options?.cursor,
    });

    const items: RankDramaItem[] = (res.items || []).map((item: any, idx: number) => ({
      rank: Number(item.rank || idx + 1),
      seriesId: String(item.series_id || ''),
      title: String(item.title || ''),
      coverUrl: String(item.cover_url || ''),
      score: item.score ? String(item.score) : undefined,
      actor: item.actor ? String(item.actor) : undefined,
      episodeCount: item.episode_count ? Number(item.episode_count) : undefined,
      description: item.description ? String(item.description) : undefined,
    }));

    return {
      items,
      cursor: res.cursor,
      hasMore: Boolean(res.has_more),
    };
  }

  // 8. 解析播放模型 (隔离敏感内容密钥，对外输出标准选路 DTO)
  public async resolvePlayback(episodeId: string): Promise<PlaybackMediaSource> {
    const client = await this.ensureClient();
    const pbRes = await client.resolvePlayback(episodeId);
    const pb = pbRes.playback;

    const streams = (pb.streams || []).map((s: any) => ({
      definition: String(s.definition || 'unknown'),
      quality: s.quality ? String(s.quality) : undefined,
      codec: s.codec ? String(s.codec) : undefined,
      url: String(s.url || ''),
      backupUrl: s.backup_url ? String(s.backup_url) : undefined,
      protected: Boolean(s.protected),
      encryption: s.encryption ? String(s.encryption) : undefined,
    }));

    return {
      episodeId: String(pb.episode_id || episodeId),
      seriesId: '',
      episodeNumber: 1,
      protected: Boolean(pb.protected),
      durationSeconds: Number(pb.duration_seconds || 0),
      expiresAt: Number(pb.expires_at || 0),
      streams,
      audioUrl: pb.audio_url ? String(pb.audio_url) : undefined,
    };
  }

  public getProfilePath(): string {
    return this.profilePath;
  }
}

export const sdkAdapter = new SdkAdapter();
