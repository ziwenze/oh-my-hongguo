import { createClient, fileProfileStore } from 'openhongguo';
import electron from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { DramaSummary, EpisodeItem, PageResult, PlaybackMediaSource } from '../../shared/types.js';

const { app } = electron;

class SdkAdapter {
  private client: any = null;
  private profileDir: string;
  private profilePath: string;

  constructor() {
    this.profileDir = path.join(app.getPath('userData'), 'profile');
    this.profilePath = path.join(this.profileDir, 'anonymous.json');
  }

  public async init(): Promise<void> {
    if (this.client) return;

    // 确保 profile 目录存在
    await fs.mkdir(this.profileDir, { recursive: true, mode: 0o700 });

    process.env.OHG_CONFIG_DIR = this.profileDir;
    const store = fileProfileStore(this.profilePath);
    this.client = await createClient({
      profile: store,
      retryAttempts: 2,
    });
    console.log('[SDK Adapter] Openhongguo Wasm client initialized at:', this.profilePath);
  }

  private async ensureClient(): Promise<any> {
    if (!this.client) {
      await this.init();
    }
    return this.client;
  }

  // 1. 发现推荐
  public async getDiscover(options?: { channel?: string; cursor?: string }): Promise<PageResult<DramaSummary>> {
    const client = await this.ensureClient();
    const res = await client.discover({
      cursor: options?.cursor,
    });

    const items: DramaSummary[] = (res.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      coverUrl: item.cover_url || '',
      coverExpiresAt: item.cover_expires_at,
      episodeCount: item.episode_count || 0,
      author: item.author,
      category: item.category,
      heat: item.heat,
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
      id: item.id,
      title: item.title,
      description: item.description || '',
      coverUrl: item.cover_url || '',
      coverExpiresAt: item.cover_expires_at,
      episodeCount: item.episode_count || 0,
      author: item.author,
      category: item.category,
    }));

    return {
      items,
      cursor: res.cursor,
      hasMore: Boolean(res.has_more),
    };
  }

  // 3. 搜索联想
  public async suggest(prefix: string): Promise<string[]> {
    if (!prefix || !prefix.trim()) return [];
    const client = await this.ensureClient();
    const res = await client.suggest(prefix.trim());
    return (res || []).map((item: any) => (typeof item === 'string' ? item : item.keyword || item.title || ''));
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
            if (item.title) hotQueries.push(item.title);
          }
        }
      }
    }

    return {
      hotQueries: hotQueries.slice(0, 10),
      searchCues: Array.isArray(cues) ? cues : [],
    };
  }

  // 5. 短剧详情
  public async getSeriesDetail(seriesId: string): Promise<DramaSummary | null> {
    const client = await this.ensureClient();
    const s = await client.getSeries(seriesId);
    if (!s) return null;
    return {
      id: s.id,
      title: s.title,
      description: s.description || '',
      coverUrl: s.cover_url || '',
      coverExpiresAt: s.cover_expires_at,
      episodeCount: s.episode_count || 0,
      author: s.author,
      category: s.category,
      heat: s.heat,
      statusText: s.right_text,
    };
  }

  // 6. 分集查询 (规范的 cursor 游标分页)
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
      id: ep.id,
      seriesId: ep.series_id || seriesId,
      number: ep.number,
      title: ep.title,
      playable: ep.playable !== false,
      isNew: Boolean(ep.is_new),
      coverUrl: ep.cover_url,
      coverExpiresAt: ep.cover_expires_at,
    }));

    return {
      items,
      cursor: res.cursor,
      hasMore: Boolean(res.has_more),
    };
  }

  // 7. 解析播放模型 (遵循两层架构，敏感数据脱敏隔离)
  public async resolvePlayback(episodeId: string): Promise<PlaybackMediaSource> {
    const client = await this.ensureClient();
    const pbRes = await client.resolvePlayback(episodeId);
    const pb = pbRes.playback;

    const streams = (pb.streams || []).map((s: any) => ({
      definition: s.definition || 'unknown',
      quality: s.quality,
      codec: s.codec,
      url: s.url,
      backupUrl: s.backup_url,
      protected: Boolean(s.protected),
      encryption: s.encryption,
    }));

    return {
      episodeId: pb.episode_id || episodeId,
      seriesId: '',
      episodeNumber: 1,
      protected: Boolean(pb.protected),
      durationSeconds: pb.duration_seconds || 0,
      expiresAt: pb.expires_at || 0,
      streams,
      audioUrl: pb.audio_url,
    };
  }

  public getProfilePath(): string {
    return this.profilePath;
  }
}

export const sdkAdapter = new SdkAdapter();
