import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { decryptCencMp4 } from './cencDecrypter.ts';

interface StreamItem {
  id: string;
  upstreamUrl: string;
  keyHex: string;
}

export class MediaDecryptionServer {
  private server: http.Server | null = null;
  private port = 0;
  private streamRegistry = new Map<string, StreamItem>();
  // 内存缓存最近 6 集已解密数据 (短剧每集仅 3~8MB，6 集约占用 20~40MB 内存，极大加快拖拽进度条与切集秒播体验)
  private cache = new Map<string, Buffer>();
  private cacheOrder: string[] = [];
  private maxCacheItems = 6;
  private inFlightDecryptions = new Map<string, Promise<Buffer>>();

  public async start(): Promise<number> {
    if (this.server) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => this.handleRequest(req, res));
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address();
        if (typeof addr === 'object' && addr !== null) {
          this.port = addr.port;
          this.server = s;
          console.log(`[MediaDecryptionServer] Local CENC stream proxy listening on http://127.0.0.1:${this.port}`);
          resolve(this.port);
        } else {
          reject(new Error('Failed to obtain local server address'));
        }
      });
      s.on('error', (err) => {
        console.error('[MediaDecryptionServer] Error:', err);
        reject(err);
      });
    });
  }

  public getPort(): number {
    return this.port;
  }

  /**
   * 注册加密短剧视频流，返回本地高速流服务 URL
   */
  public registerStream(upstreamUrl: string, keyHex: string): string {
    const streamId = crypto.createHash('md5').update(`${upstreamUrl}_${keyHex}`).digest('hex').slice(0, 16);
    this.streamRegistry.set(streamId, {
      id: streamId,
      upstreamUrl,
      keyHex,
    });
    return `http://127.0.0.1:${this.port}/stream/${streamId}.mp4`;
  }

  private async getDecryptedBuffer(item: StreamItem): Promise<Buffer> {
    const cached = this.cache.get(item.id);
    if (cached) {
      return cached;
    }

    // 防抖与并发保护：同一流同时发生多个 Range 请求时共享同一笔解密 Promise
    const inFlight = this.inFlightDecryptions.get(item.id);
    if (inFlight) {
      return await inFlight;
    }

    const task = (async () => {
      const t0 = Date.now();
      const res = await fetch(item.upstreamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch upstream encrypted media: HTTP ${res.status}`);
      }
      const rawArray = await res.arrayBuffer();
      const rawBuf = Buffer.from(rawArray);
      const decBuf = decryptCencMp4(rawBuf, item.keyHex);

      // 放入 LRU 缓存
      this.cache.set(item.id, decBuf);
      this.cacheOrder.push(item.id);
      if (this.cacheOrder.length > this.maxCacheItems) {
        const oldest = this.cacheOrder.shift();
        if (oldest) this.cache.delete(oldest);
      }
      console.log(`[MediaDecryptionServer] Stream ${item.id} (${(decBuf.length / 1024 / 1024).toFixed(1)}MB) decrypted in ${Date.now() - t0}ms`);
      return decBuf;
    })();

    this.inFlightDecryptions.set(item.id, task);
    try {
      return await task;
    } finally {
      this.inFlightDecryptions.delete(item.id);
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const match = url.pathname.match(/\/stream\/([a-f0-9]+)\.mp4/);
      if (!match) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const streamId = match[1];
      const item = this.streamRegistry.get(streamId);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Stream session expired or not registered');
        return;
      }

      const buffer = await this.getDecryptedBuffer(item);
      const total = buffer.length;
      const range = req.headers.range;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

        if (start >= total || end >= total) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }

        const chunk = buffer.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': chunk.length,
        });
        res.end(chunk);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
        });
        res.end(buffer);
      }
    } catch (err: any) {
      console.error('[MediaDecryptionServer] Request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      res.end(`Internal Server Error: ${err?.message || err}`);
    }
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.cache.clear();
      this.cacheOrder = [];
      this.streamRegistry.clear();
      console.log('[MediaDecryptionServer] Stopped local media stream server');
    }
  }
}

export const mediaDecryptionServer = new MediaDecryptionServer();
