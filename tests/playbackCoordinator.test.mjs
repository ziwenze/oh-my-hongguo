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

  let currentToken = null;

  await t.test('1. startSession initializes resolving state and issues session token without fake history', async () => {
    const token = await coordinator.startSession(
      {
        seriesId: 'series_99',
        seriesTitle: '短剧99',
        episodeId: 'ep_1',
        episodeNumber: 1,
        episodeTitle: '第1集',
        positionSeconds: 0,
        durationSeconds: 120,
      },
      1 // ownerWindowId
    );

    assert.ok(token.sessionId, 'Must issue a valid sessionId');
    assert.equal(token.ownerWindowId, 1);
    currentToken = token;

    const session = coordinator.getCurrentSession();
    assert.equal(session?.seriesId, 'series_99');
    assert.equal(session?.status, 'resolving');

    await ds.flushAsync();
    const history = await ds.getHistory();
    // 关键断言：resolving 状态不能提前写入历史！
    assert.equal(history.length, 0, 'Should not write history entry when only in resolving state');
  });

  await t.test('2. Error status with valid token updates state and does not create fake play history', async () => {
    const success = await coordinator.updateStatus(currentToken, 'error', 'DRM_PROTECTED_GATE', 1);
    assert.equal(success, true);

    const session = coordinator.getCurrentSession();
    assert.equal(session?.status, 'error');
    assert.equal(session?.errorMessage, 'DRM_PROTECTED_GATE');

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 0, 'Error status without actual playback must not create fake history');
  });

  await t.test('3. Entering playing status with valid token records actual playback to history', async () => {
    currentToken = await coordinator.startSession(
      {
        seriesId: 'series_99',
        seriesTitle: '短剧99',
        episodeId: 'ep_1',
        episodeNumber: 1,
        episodeTitle: '第1集',
        positionSeconds: 0,
        durationSeconds: 120,
      },
      1
    );

    await coordinator.updateStatus(currentToken, 'ready', undefined, 1);
    await coordinator.updateStatus(currentToken, 'playing', undefined, 1);

    const session = coordinator.getCurrentSession();
    assert.equal(session?.status, 'playing');

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 1, 'Playing status should write history');
    assert.equal(history[0].seriesId, 'series_99');
    assert.equal(history[0].episodeNumber, 1);
  });

  await t.test('4. Token validation: rejects stale token and unauthorized window calls', async () => {
    // 伪造或过期的 Token
    const fakeToken = {
      sessionId: 'sess_stale_12345',
      generation: 999,
      ownerWindowId: 1,
    };

    const statusResult = await coordinator.updateStatus(fakeToken, 'paused', undefined, 1);
    assert.equal(statusResult, false, 'Stale token must be rejected');

    const progressResult = await coordinator.updateProgress(fakeToken, { positionSeconds: 50 }, 1);
    assert.equal(progressResult, false, 'Progress with stale token must be rejected');

    // 来自未授权窗口 (Window ID 2 尝试操作 Window ID 1 的会话)
    const unauthorizedResult = await coordinator.updateProgress(currentToken, { positionSeconds: 50 }, 2);
    assert.equal(unauthorizedResult, false, 'Call from non-owner window must be rejected');
  });

  await t.test('5. Progress updates throttle sync to history store and sanitize numbers', async () => {
    await coordinator.updateProgress(currentToken, { positionSeconds: 10, durationSeconds: 120 }, 1);
    // 测试 NaN / 无效值保护
    await coordinator.updateProgress(currentToken, { positionSeconds: NaN, durationSeconds: Infinity }, 1);
    assert.equal(coordinator.getCurrentSession()?.positionSeconds, 10);

    await new Promise((r) => setTimeout(r, 60)); // 等待超过 50ms 节流门限
    await coordinator.updateProgress(currentToken, { positionSeconds: 25.5, durationSeconds: 120 }, 1);

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].positionSeconds, 25.5);
  });

  await t.test('6. Session succession: starting a new session commits previous session progress before replacing', async () => {
    // 当前会话处于 25.5 秒
    // 启动新会话 (例如切到第 2 集)
    const token2 = await coordinator.startSession(
      {
        seriesId: 'series_99',
        seriesTitle: '短剧99',
        episodeId: 'ep_2',
        episodeNumber: 2,
        episodeTitle: '第2集',
        positionSeconds: 0,
        durationSeconds: 120,
      },
      1
    );

    await ds.flushAsync();
    const history = await ds.getHistory();
    // 验证：第 1 集的进度 25.5 秒已被稳妥提交！
    const ep1History = history.find((h) => h.episodeId === 'ep_1');
    assert.ok(ep1History, 'Previous session must be committed on succession');
    assert.equal(ep1History.positionSeconds, 25.5);

    currentToken = token2;
  });

  await t.test('7. Window ownership transfer for PiP handoff', async () => {
    // 将会话所有权移交至独立小窗 (Window ID 2)
    const pipToken = coordinator.transferOwnership(2);
    assert.ok(pipToken);
    assert.equal(pipToken.ownerWindowId, 2);
    assert.equal(pipToken.generation > currentToken.generation, true);

    // 旧窗口 (Window 1) 使用旧 Token 试图更新进度：必须被阻断！
    const staleResult = await coordinator.updateProgress(currentToken, { positionSeconds: 50 }, 1);
    assert.equal(staleResult, false, 'Old window with stale token must be blocked');

    // 新窗口 (Window 2) 使用新 Token 更新进度：成功接受！
    const newResult = await coordinator.updateProgress(pipToken, { positionSeconds: 40, durationSeconds: 120 }, 2);
    assert.equal(newResult, true, 'New owner window must be accepted');

    currentToken = pipToken;
  });

  await t.test('8. Closing session commits final position and clears active session', async () => {
    await coordinator.updateStatus(currentToken, 'playing', undefined, 2);
    await coordinator.updateProgress(currentToken, { positionSeconds: 88.5, durationSeconds: 120 }, 2);
    const closeResult = await coordinator.closeSession(currentToken, 2);
    assert.equal(closeResult, true);

    assert.equal(coordinator.getCurrentSession(), null);

    await ds.flushAsync();
    const history = await ds.getHistory();
    const ep2History = history.find((h) => h.episodeId === 'ep_2');
    assert.ok(ep2History);
    assert.equal(ep2History.positionSeconds, 88.5);
  });

  await t.test('9. Strictly prevents state regression from playing to ready', async () => {
    const token = await coordinator.startSession(
      {
        seriesId: 'series_regression_test',
        seriesTitle: '状态机防倒退测试剧',
        episodeId: 'ep_1',
        episodeNumber: 1,
        episodeTitle: '第1集',
        positionSeconds: 0,
        durationSeconds: 120,
      },
      1
    );

    // 正常流转至 ready -> playing
    await coordinator.updateStatus(token, 'ready', undefined, 1);
    assert.equal(coordinator.getCurrentSession()?.status, 'ready');
    await coordinator.updateStatus(token, 'playing', undefined, 1);
    assert.equal(coordinator.getCurrentSession()?.status, 'playing');

    // 模拟后发的 load() 返回尝试将状态置为 ready: 必须被阻断！
    const regResult = await coordinator.updateStatus(token, 'ready', undefined, 1);
    assert.equal(regResult, false, 'Transition from playing to ready must be blocked');
    assert.equal(
      coordinator.getCurrentSession()?.status,
      'playing',
      'Status must remain playing and reject regression to ready'
    );

    await ds.flushAsync();
  });

  await fs.rm(testBaseDir, { recursive: true, force: true });
});
