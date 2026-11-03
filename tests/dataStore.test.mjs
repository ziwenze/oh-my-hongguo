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

  // 测试完毕清理
  await fs.rm(testBaseDir, { recursive: true, force: true });
});
