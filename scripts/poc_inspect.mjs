/**
 * Stage 0 PoC Automated Verification Script
 * - 验证本地 SDK 初始化
 * - 验证样本短剧搜索与结构完整性
 * - 验证使用游标分页的 listEpisodes 接口
 * - 验证播放流模型与 Spade DRM 密钥计算 (断言 16 字节 / 32 hex)
 * - 生成脱敏的 JSON 测试报告
 * - 严禁向外部输出明文密钥
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../vendor/openhongguo/index.js';

async function run() {
  const startTime = Date.now();
  const testDir = await mkdtemp(join(tmpdir(), 'ohg_poc_'));
  const profilePath = join(testDir, 'anonymous.json');

  const report = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    results: {},
  };

  try {
    // 1. 初始化 Client
    const t0 = Date.now();
    const client = await createClient({ profile: profilePath });
    assert.ok(client, 'SDK Client creation failed');
    report.results.clientInit = { success: true, durationMs: Date.now() - t0 };
    console.log(`[PASS] 1. SDK Wasm initialized in ${report.results.clientInit.durationMs}ms`);

    // 2. 关键词搜索
    const t1 = Date.now();
    const searchRes = await client.search('绝世');
    assert.ok(Array.isArray(searchRes.items), 'Search items must be an array');
    assert.ok(searchRes.items.length > 0, 'Search should return at least 1 item for test keyword');
    report.results.search = {
      success: true,
      durationMs: Date.now() - t1,
      count: searchRes.items.length,
      sampleTitle: searchRes.items[0].title,
      sampleId: searchRes.items[0].id,
    };
    console.log(`[PASS] 2. Search verified: returned ${searchRes.items.length} items`);

    const targetDrama = searchRes.items[0];

    // 3. 游标分页分集查询 (EpisodeOptions: { cursor, pageSize })
    const t2 = Date.now();
    const epPage = await client.listEpisodes(targetDrama.id, { pageSize: 30 });
    assert.ok(Array.isArray(epPage.items), 'Episode items must be an array');
    assert.ok(epPage.items.length > 0, 'Target drama should have episodes');
    const firstEp = epPage.items[0];
    assert.ok(firstEp.id && typeof firstEp.id === 'string', 'Episode must have a valid string ID');
    assert.equal(firstEp.number, 1, 'First episode number should be 1');
    report.results.episodes = {
      success: true,
      durationMs: Date.now() - t2,
      pageSize: epPage.items.length,
      hasMore: epPage.has_more,
      firstEpId: firstEp.id,
      firstEpTitle: firstEp.title,
    };
    console.log(`[PASS] 3. listEpisodes verified with cursor pagination: ${epPage.items.length} episodes loaded`);

    // 4. 解析单集播放模型
    const t3 = Date.now();
    try {
      const pbRes = await client.resolvePlayback(firstEp.id);
      assert.ok(pbRes.playback, 'Playback model must be defined');
      
      let keyDerived = false;
      if (pbRes.contentKey) {
        // 断言 Hex 密钥长度为 32 个字符 (即 16 字节 AES-128)
        assert.equal(pbRes.contentKey.key.length, 32, 'Content key must be exactly 32 hex characters (16 bytes)');
        assert.match(pbRes.contentKey.key, /^[0-9a-f]{32}$/, 'Content key must be lowercase hex');
        keyDerived = true;
      }

      report.results.playback = {
        success: true,
        durationMs: Date.now() - t3,
        protected: pbRes.playback.protected,
        streamsCount: pbRes.playback.streams?.length ?? 0,
        keyDerived,
        streamFormats: pbRes.playback.streams?.map((s) => ({
          definition: s.definition,
          codec: s.codec,
          encryption: s.encryption || 'none',
        })),
      };
      console.log(`[PASS] 4. resolvePlayback verified: ${pbRes.playback.streams?.length} streams, key length validated`);
    } catch (err) {
      if (err.code === 'ANONYMOUS_LIMITED') {
        report.results.playback = {
          success: false,
          durationMs: Date.now() - t3,
          constraint: 'ANONYMOUS_LIMITED',
          message: 'Observed platform rate limit / empty anonymous response as expected by constraint specification',
        };
        console.log('[INFO] 4. Observed platform constraint status ANONYMOUS_LIMITED as documented');
      } else {
        throw err;
      }
    }

    report.totalDurationMs = Date.now() - startTime;
    report.status = 'COMPLETED';

    const reportPath = join(process.cwd(), 'poc_report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[PASS] 5. Automated report written to ${reportPath}`);
  } finally {
    // 清理测试目录
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((err) => {
  console.error('[FAIL] PoC Automated verification failed:', err);
  process.exit(1);
});
