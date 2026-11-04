import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DataStore } from '../src/main/store/dataStore.ts';
import { PlaybackSessionCoordinator } from '../src/main/session/coordinator.ts';

test('PlaybackSessionCoordinator production unit tests', async (t) => {
  const testBaseDir = await fs.mkdtemp(path.join(tmpdir(), 'coord_real_test_'));
  const ds = new DataStore(testBaseDir);
  await ds.load();

  // 直接实例化生产代码中的 PlaybackSessionCoordinator，传入测试 DataStore 与 50ms 节流
  const coordinator = new PlaybackSessionCoordinator(ds, 50);

  await t.test('1. startSession initializes resolving state and does NOT write fake history yet', async () => {
    const session = await coordinator.startSession({
      seriesId: 'series_99',
      seriesTitle: '短剧99',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 0,
      durationSeconds: 120,
    });

    assert.equal(session.seriesId, 'series_99');
    assert.equal(session.status, 'resolving');

    await ds.flushAsync();
    const history = await ds.getHistory();
    // 关键断言：resolving 状态不能提前写入历史！
    assert.equal(history.length, 0, 'Should not write history entry when only in resolving state');
  });

  await t.test('2. Error status updates state and does not create fake play history', async () => {
    await coordinator.updateStatus('error', 'DRM_PROTECTED_GATE');
    const session = coordinator.getCurrentSession();
    assert.equal(session?.status, 'error');
    assert.equal(session?.errorMessage, 'DRM_PROTECTED_GATE');

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 0, 'Error status without actual playback must not create fake history');
  });

  await t.test('3. Entering playing status records actual playback to history', async () => {
    // 重新开启会话并进入 playing 状态
    await coordinator.startSession({
      seriesId: 'series_99',
      seriesTitle: '短剧99',
      episodeId: 'ep_1',
      episodeNumber: 1,
      episodeTitle: '第1集',
      positionSeconds: 0,
      durationSeconds: 120,
    });

    await coordinator.updateStatus('playing');
    const session = coordinator.getCurrentSession();
    assert.equal(session?.status, 'playing');

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 1, 'Playing status should write history');
    assert.equal(history[0].seriesId, 'series_99');
    assert.equal(history[0].episodeNumber, 1);
  });

  await t.test('4. Progress updates throttle sync to history store and sanitize numbers', async () => {
    // 模拟多次进度跳动与 NaN 防御
    await coordinator.updateProgress({ positionSeconds: 10, durationSeconds: 120 });
    // 测试 NaN / 无效值保护
    await coordinator.updateProgress({ positionSeconds: NaN, durationSeconds: Infinity });
    assert.equal(coordinator.getCurrentSession()?.positionSeconds, 10);

    await new Promise((r) => setTimeout(r, 60)); // 等待超过 50ms 节流门限
    await coordinator.updateProgress({ positionSeconds: 25.5, durationSeconds: 120 });

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].positionSeconds, 25.5);
  });

  await t.test('5. Closing session commits final position and clears active session', async () => {
    await coordinator.updateProgress({ positionSeconds: 78.5, durationSeconds: 120 });
    await coordinator.closeSession();

    assert.equal(coordinator.getCurrentSession(), null);

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history[0].positionSeconds, 78.5);
  });

  await fs.rm(testBaseDir, { recursive: true, force: true });
});
