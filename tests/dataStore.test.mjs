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

  await t.test('6. Concurrent interleaved async write vs flushSync: abort guard prevents stale overwrite via controlled barrier', async () => {
    const dsInterleaved = new DataStore(testBaseDir);
    await dsInterleaved.load();

    let resolveBarrier;
    const barrierPromise = new Promise((resolve) => {
      resolveBarrier = resolve;
    });

    let hookHit = false;
    dsInterleaved._testPreRenameHook = async () => {
      hookHit = true;
      // 故意在写完 tmp 准备 rename 之前挂起，等待 flushSync 抢先落盘 V2
      await barrierPromise;
    };

    // 触发 V1 (进度为 10 秒) 并排入异步写入队列
    await dsInterleaved.saveHistory({
      seriesId: 'series_same_id',
      seriesTitle: '交错测试剧',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 10,
      durationSeconds: 100,
      progressPercentage: 10,
      updatedAt: 1000,
    });
    const pendingAsync = dsInterleaved.flushAsync();

    // 循环等待 hook 确认命中 (此时 V1 的 tmp 文件已序列化写入 10 秒，卡在 rename 之前)
    while (!hookHit) {
      await new Promise((r) => setTimeout(r, 5));
    }

    // 在 V1 停留在 rename 之前，触发最新进度 V2 (进度更新为 99 秒) 并调用 flushSync 同步抢先落盘
    await dsInterleaved.saveHistory({
      seriesId: 'series_same_id',
      seriesTitle: '交错测试剧',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 99,
      durationSeconds: 100,
      progressPercentage: 99,
      updatedAt: 2000,
    });
    dsInterleaved.flushSync();

    // 释放栅栏，唤醒 V1 继续执行
    resolveBarrier();
    await pendingAsync;

    // 验证磁盘上必须保留最新的 V2 数据 (99秒)，带有旧数据 (10秒) 的 V1 tmp 被落盘版本守卫干净阻断与清理
    const dsCheck = new DataStore(testBaseDir);
    await dsCheck.load();
    const history = await dsCheck.getHistory();
    const record = history.find((h) => h.seriesId === 'series_same_id');
    assert.ok(record, 'Record must exist on disk');
    assert.equal(
      record.positionSeconds,
      99,
      'Stale V1 (10s) must NOT overwrite V2 (99s) on disk despite async race'
    );
  });

  await t.test('7. Closed store rejects subsequent async and sync phantom writes', async () => {
    const dsClosed = new DataStore(testBaseDir);
    await dsClosed.load();
    await dsClosed.closeAsync();

    await dsClosed.saveHistory({
      seriesId: 'phantom_write',
      seriesTitle: '幽灵写入剧',
      episodeId: 'ep_phantom',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 10,
      durationSeconds: 100,
      progressPercentage: 10,
      updatedAt: Date.now(),
    });

    dsClosed.saveHistorySync({
      seriesId: 'phantom_write_sync',
      seriesTitle: '幽灵同步写入剧',
      episodeId: 'ep_phantom_2',
      episodeNumber: 2,
      episodeTitle: '第2集',
      positionSeconds: 20,
      durationSeconds: 100,
      progressPercentage: 20,
      updatedAt: Date.now(),
    });

    const dsReload = new DataStore(testBaseDir);
    await dsReload.load();
    const history = await dsReload.getHistory();
    assert.equal(history.find((h) => h.seriesId === 'phantom_write'), undefined);
    assert.equal(history.find((h) => h.seriesId === 'phantom_write_sync'), undefined);
  });

  await t.test('8. Shutdown coordination: flushSync persists without blocking final close session write', async () => {
    const dsShutdown = new DataStore(testBaseDir);
    await dsShutdown.load();

    // 模拟应用运行期间某次常规 flushSync
    await dsShutdown.saveHistory({
      seriesId: 'series_mid_run',
      seriesTitle: '运行中剧集',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 30,
      durationSeconds: 120,
      progressPercentage: 25,
      updatedAt: Date.now(),
    });
    dsShutdown.flushSync();

    // 模拟 before-quit 触发时，closeSessionSync 调用的 saveHistorySync (此时尚未调用 closeSync)
    dsShutdown.saveHistorySync({
      seriesId: 'series_final_exit',
      seriesTitle: '最终退出剧集',
      episodeId: 'ep_exit',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 110,
      durationSeconds: 120,
      progressPercentage: 91,
      updatedAt: Date.now(),
    });

    // 随后执行 closeSync 封锁持久层
    dsShutdown.closeSync();

    // 验证：最终退出时的断点数据成功落盘，且之后的写入被阻断
    const dsVerify = new DataStore(testBaseDir);
    await dsVerify.load();
    const history = await dsVerify.getHistory();
    const exitItem = history.find((h) => h.seriesId === 'series_final_exit');
    assert.ok(exitItem, 'Final exit position must be written to disk before closeSync seals store');
    assert.equal(exitItem.positionSeconds, 110);
  });

  // 测试完毕清理
  await fs.rm(testBaseDir, { recursive: true, force: true });
});
