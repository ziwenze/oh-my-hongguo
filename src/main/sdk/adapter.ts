import { createClient, fileProfileStore, memoryProfileStore } from 'openhongguo';
import electron from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type {
  DramaSummary,
  EpisodeItem,
  PageResult,
  PlaybackMediaSource,
  RankDramaItem,
  SearchSuggestionItem,
} from '../../shared/types.js';

const { app } = electron;

// --- 纯函数 DTO 规范化映射器 (可独立离线测试) ---

export function normalizeDramaSummary(item: any): DramaSummary {
  return {
    id: String(item?.id ?? ''),
    title: String(item?.title ?? ''),
    description: String(item?.description ?? ''),
    coverUrl: String(item?.cover_url ?? ''),
    coverExpiresAt: item?.cover_expires_at ? String(item.cover_expires_at) : undefined,
    episodeCount: Number(item?.episode_count || 0),
    author: item?.author ? String(item.author) : undefined,
    category: item?.category ? String(item.category) : undefined,
    heat: typeof item?.heat === 'number' && Number.isFinite(item.heat) ? item.heat : undefined,
    statusText: item?.right_text ? String(item.right_text) : undefined,
  };
}

export function normalizeEpisodeItem(ep: any, fallbackSeriesId: string): EpisodeItem {
  return {
    id: String(ep?.id ?? ''),
    seriesId: String(ep?.series_id || fallbackSeriesId),
    number: Number(ep?.number || 0),
    title: String(ep?.title || `第${ep?.number ?? 1}集`),
    playable: ep?.playable !== false,
    isNew: Boolean(ep?.is_new),
    coverUrl: ep?.cover_url ? String(ep.cover_url) : undefined,
    coverExpiresAt: ep?.cover_expires_at ? String(ep.cover_expires_at) : undefined,
  };
}

export function normalizeSuggestionItem(item: any): SearchSuggestionItem {
  return {
    text: String(item?.text || item?.title || item?.keyword || ''),
    keyword: item?.keyword ? String(item.keyword) : undefined,
  };
}

export function normalizeRankItem(item: any, defaultRank: number): RankDramaItem {
  return {
    rank: Number(item?.rank || defaultRank),
    seriesId: String(item?.series_id ?? ''),
    title: String(item?.title ?? ''),
    coverUrl: String(item?.cover_url ?? ''),
    score: item?.score ? String(item.score) : undefined,
    actor: item?.actor ? String(item.actor) : undefined,
    episodeCount: item?.episode_count ? Number(item.episode_count) : undefined,
    description: item?.description ? String(item.description) : undefined,
  };
}

export function normalizePlaybackSource(pb: any, fallbackEpisodeId: string): PlaybackMediaSource {
  const streams = (pb?.streams || []).map((s: any) => ({
    definition: String(s?.definition || 'unknown'),
    quality: s?.quality ? String(s.quality) : undefined,
    codec: s?.codec ? String(s.codec) : undefined,
    url: String(s?.url || ''),
    backupUrl: s?.backup_url ? String(s.backup_url) : undefined,
    protected: Boolean(s?.protected),
    encryption: s?.encryption ? String(s.encryption) : undefined,
  }));

  return {
    episodeId: String(pb?.episode_id || fallbackEpisodeId),
    seriesId: '',
    episodeNumber: 1,
    protected: Boolean(pb?.protected),
    durationSeconds: Number(pb?.duration_seconds || 0),
    expiresAt: Number(pb?.expires_at || 0),
    streams,
    audioUrl: pb?.audio_url ? String(pb.audio_url) : undefined,
  };
}

export function createMockClient() {
  return {
    discover: async () => ({
      items: [
        {
          id: 'mock_series_1',
          title: '测试精选短剧1',
          description: '测试短剧描述1',
          cover_url: 'https://example.com/cover1.jpg',
          episode_count: 30,
          author: '测试作者1',
          category: '都市逆袭',
          heat: 15000000,
          right_text: '全30集',
        },
        {
          id: 'mock_series_2',
          title: '测试精选短剧2',
          description: '测试短剧描述2',
          cover_url: 'https://example.com/cover2.jpg',
          episode_count: 50,
          author: '测试作者2',
          category: '战神归来',
          heat: 28000000,
          right_text: '全50集',
        },
      ],
      cursor: 'mock_cursor_next',
      has_more: true,
    }),
    search: async (query: string) => ({
      items: [
        {
          id: 'mock_series_search',
          title: `搜索结果: ${query}`,
          description: '匹配短剧',
          cover_url: 'https://example.com/cover_s.jpg',
          episode_count: 60,
          author: '搜索作者',
          category: '搜索分类',
        },
      ],
      has_more: false,
    }),
    suggest: async (prefix: string) => [
      { text: `${prefix}短剧`, keyword: `${prefix}短剧` },
      { text: `${prefix}小说原著`, keyword: 'mock_novel_id' },
    ],
    hotSearch: async () => ({
      boards: [
        {
          title: '短剧热搜榜',
          items: [{ title: '热搜短剧A' }, { title: '热搜短剧B' }],
        },
      ],
    }),
    searchCues: async () => ['搜你想看：绝世战神', '搜你想看：神医赘婿'],
    getSeries: async (seriesId: string) => ({
      id: seriesId,
      title: '短剧详情测试',
      description: '完整剧目剧情简介',
      cover_url: 'https://example.com/cover_detail.jpg',
      episode_count: 30,
      author: '知名作者',
      category: '都市热血',
      heat: 22000000,
      right_text: '全30集',
    }),
    listEpisodes: async (seriesId: string, options?: any) => ({
      items: Array.from({ length: options?.pageSize || 10 }, (_, i) => ({
        id: `ep_${seriesId}_${i + 1}`,
        series_id: seriesId,
        number: i + 1,
        title: `第${i + 1}集`,
        playable: true,
        is_new: i === 0,
        cover_url: `https://example.com/ep_${i + 1}.jpg`,
      })),
      cursor: 'mock_ep_cursor_2',
      has_more: true,
    }),
    shortRank: async () => ({
      items: [
        {
          rank: 1,
          series_id: 'mock_rank_1',
          title: '风云榜第一名',
          cover_url: 'https://example.com/rank1.jpg',
          score: '9999万热度',
          actor: '主演小张',
          episode_count: 80,
        },
      ],
      has_more: false,
    }),
    resolvePlayback: async (episodeId: string) => {
      let streamUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      try {
        const candidates: string[] = [];
        try {
          if (app?.getAppPath) {
            candidates.push(path.join(app.getAppPath(), 'tests/fixtures/sample.webm'));
          }
        } catch {}
        if (typeof process.resourcesPath === 'string') {
          candidates.push(path.join(process.resourcesPath, 'tests/fixtures/sample.webm'));
          candidates.push(path.join(process.resourcesPath, 'fixtures/sample.webm'));
        }
        // 源码与开发模式回退 (打包生产模式下 app.isPackaged 为 true，绝不依赖 process.cwd() 寻找资源)
        if (!app?.isPackaged) {
          candidates.push(
            path.resolve(process.cwd(), 'tests/fixtures/sample.webm'),
            path.resolve(__dirname, '../../tests/fixtures/sample.webm'),
            path.resolve(__dirname, '../tests/fixtures/sample.webm')
          );
        }

        for (const cand of candidates) {
          if (cand && fsSync.existsSync(cand)) {
            const buf = fsSync.readFileSync(cand);
            streamUrl = `data:video/webm;base64,${buf.toString('base64')}`;
            console.log('[Mock SDK] Successfully resolved sample.webm from:', cand);
            break;
          }
        }
      } catch {}
      console.log('[Mock SDK] resolvePlayback streamUrl type:', streamUrl.startsWith('data:') ? 'data:video/webm' : 'remote URL');

      return {
        playback: {
          episode_id: episodeId,
          duration_seconds: 7.8, // sample.webm 真实媒体时长
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          protected: false,
          streams: [
            {
              definition: '720p',
              quality: 'high',
              codec: 'vp8',
              url: streamUrl,
              protected: false,
            },
          ],
        },
      };
    },
  };
}

export class SdkAdapter {
  private client: any = null;
  private clientInitPromise: Promise<any> | null = null;
  private profileDir!: string;
  private profilePath!: string;

  private ensureProfilePaths(): void {
    if (!this.profilePath) {
      const baseDir = process.env.OHG_CONFIG_DIR || (app?.getPath ? app.getPath('userData') : process.cwd());
      this.profileDir = process.env.OHG_CONFIG_DIR ? process.env.OHG_CONFIG_DIR : path.join(baseDir, 'profile');
      this.profilePath = path.join(this.profileDir, 'anonymous.json');
    }
  }

  // 离线/打包验收测试：直接实例化解包后的 Go WebAssembly 运行时并校验方法表挂载
  public async verifyWasmRuntime(): Promise<boolean> {
    const store = memoryProfileStore();
    const client = await createClient({
      profile: store,
      retryAttempts: 1,
    });
    return typeof client?.getSeries === 'function';
  }

  // 并发安全的单例初始化 (共享 in-flight Promise)
  public async init(): Promise<void> {
    if (this.client) return;
    if (this.clientInitPromise) {
      await this.clientInitPromise;
      return;
    }

    this.clientInitPromise = (async () => {
      if (process.env.OHG_MOCK_SDK === '1') {
        this.client = createMockClient();
        console.log('[SDK Adapter] Mock SDK Client initialized for offline E2E test mode');
        return;
      }
      this.ensureProfilePaths();
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

    const items: DramaSummary[] = (res.items || []).map(normalizeDramaSummary);

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

    const items: DramaSummary[] = (res.items || []).map(normalizeDramaSummary);

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
    return (res || []).map(normalizeSuggestionItem);
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
    return normalizeDramaSummary(s);
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

    const items: EpisodeItem[] = (res.items || []).map((ep: any) => normalizeEpisodeItem(ep, seriesId));

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

    const items: RankDramaItem[] = (res.items || []).map((item: any, idx: number) =>
      normalizeRankItem(item, idx + 1)
    );

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
    return normalizePlaybackSource(pbRes.playback, episodeId);
  }

  public getProfilePath(): string {
    this.ensureProfilePaths();
    return this.profilePath;
  }
}

export const sdkAdapter = new SdkAdapter();
