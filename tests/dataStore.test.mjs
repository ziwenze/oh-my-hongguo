import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DataStore, CURRENT_SCHEMA_VERSION } from '../src/main/store/dataStore.ts';

test('DataStore offline unit test suite', async (t) => {
  const testBaseDir = await fs.mkdtemp(path.join(tmpdir(), 'ds_test_'));

  await t.test('1. Normal read, write and atomic persist', async () => {
    const ds = new DataStore(testBaseDir);
    await ds.load();

    const historyItem = {
      seriesId: '1001',
      seriesTitle: '测试短剧A',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 45.2,
      durationSeconds: 120.0,
      progressPercentage: 37.6,
      updatedAt: Date.now(),
    };

    await ds.saveHistory(historyItem);
    await ds.flushAsync();

    // 重新加载验证
    const ds2 = new DataStore(testBaseDir);
    await ds2.load();
    const history = await ds2.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].seriesId, '1001');
    assert.equal(history[0].positionSeconds, 45.2);
  });

  await t.test('2. Concurrent writes queue serialization without tmp collision', async () => {
    const ds = new DataStore(testBaseDir);
    await ds.load();

    // 并发触发 20 次异步写入
    const tasks = Array.from({ length: 20 }, (_, i) =>
      ds.saveHistory({
        seriesId: `concurrent_${i}`,
        seriesTitle: `短剧_${i}`,
        episodeId: `ep_${i}`,
        episodeNumber: i,
        episodeTitle: `第${i}集`,
        positionSeconds: i * 2,
        durationSeconds: 100,
        progressPercentage: i * 2,
        updatedAt: Date.now() + i,
      })
    );

    await Promise.all(tasks);
    await ds.flushAsync();

    const dsReload = new DataStore(testBaseDir);
    await dsReload.load();
    const list = await dsReload.getHistory();
    assert.equal(list.length, 21); // 1 (上个测试) + 20
  });

  await t.test('3. Corruption recovery from .bak file', async () => {
    const filePath = path.join(testBaseDir, 'store.json');
    // 故意损坏主文件
    await fs.writeFile(filePath, '{{INVALID_JSON_CORRUPTED_CONTENT', 'utf8');

    const dsRecover = new DataStore(testBaseDir);
    await dsRecover.load();
    const recoveredHistory = await dsRecover.getHistory();
    assert.ok(recoveredHistory.length > 0, 'Should have recovered from .bak backup');
  });

  await t.test('4. Both main and backup corrupted: preserves corrupted file and resets gracefully', async () => {
    const filePath = path.join(testBaseDir, 'store.json');
    const bakPath = path.join(testBaseDir, 'store.json.bak');
    // 主文件与备份均损坏
    await fs.writeFile(filePath, '{{BROKEN_JSON_MAIN', 'utf8');
    await fs.writeFile(bakPath, '{{BROKEN_JSON_BAK', 'utf8');

    const dsGraceful = new DataStore(testBaseDir);
    await dsGraceful.load();
    const freshHistory = await dsGraceful.getHistory();
    assert.equal(freshHistory.length, 0, 'Should reset to empty store without crashing');

    // 验证损坏文件被保留
    const files = await fs.readdir(testBaseDir);
    const hasCorruptedArchive = files.some((f) => f.startsWith('store.corrupted.'));
    assert.ok(hasCorruptedArchive, 'Should archive corrupted file instead of quietly overwriting');
  });

  await t.test('5. flushSync executes synchronously and updates storage immediately upon process exit', async () => {
    const dsSync = new DataStore(testBaseDir);
    await dsSync.load();

    await dsSync.saveHistory({
      seriesId: 'sync_test_series',
      seriesTitle: '同步退出测试剧',
      episodeId: 'ep_sync',
      episodeNumber: 10,
      episodeTitle: '第10集',
      positionSeconds: 88,
      durationSeconds: 120,
      progressPercentage: 73,
      updatedAt: Date.now(),
    });

    // 立即执行同步刷盘，不等待 500ms 防抖计时器
    dsSync.flushSync();

    const dsVerify = new DataStore(testBaseDir);
    await dsVerify.load();
    const list = await dsVerify.getHistory();
    const found = list.find((h) => h.seriesId === 'sync_test_series');
    assert.ok(found, 'flushSync should persist new record without waiting for timeout');
    assert.equal(found.positionSeconds, 88);
  });

  await t.test('6. Concurrent interleaved async write vs flushSync: abort guard prevents stale overwrite', async () => {
    const dsInterleaved = new DataStore(testBaseDir);
    await dsInterleaved.load();

    // 触发写入并排入异步队列
    await dsInterleaved.saveHistory({
      seriesId: 'series_v1',
      seriesTitle: '版本1',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 10,
      durationSeconds: 100,
      progressPercentage: 10,
      updatedAt: 1000,
    });
    const pendingAsync = dsInterleaved.flushAsync();

    // 紧接着写入最新版本 V2 并调用 flushSync 同步落盘
    await dsInterleaved.saveHistory({
      seriesId: 'series_v2_latest',
      seriesTitle: '最新版本2',
      episodeId: 'ep_2',
      episodeNumber: 2,
      episodeTitle: '第2集',
      positionSeconds: 99,
      durationSeconds: 100,
      progressPercentage: 99,
      updatedAt: 2000,
    });
    dsInterleaved.flushSync();

    // 等待先前排队的异步操作结束
    await pendingAsync;

    // 验证磁盘上必须保留最新的 V2 数据
    const dsCheck = new DataStore(testBaseDir);
    await dsCheck.load();
    const history = await dsCheck.getHistory();
    const v2Found = history.find((h) => h.seriesId === 'series_v2_latest');
    assert.ok(v2Found, 'Latest V2 must be preserved on disk despite pending V1 async write');
    assert.equal(v2Found.positionSeconds, 99);
  });

  // 测试完毕清理
  await fs.rm(testBaseDir, { recursive: true, force: true });
});
