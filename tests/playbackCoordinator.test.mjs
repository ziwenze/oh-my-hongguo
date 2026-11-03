import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DataStore } from '../src/main/store/dataStore.ts';

// 模拟主进程会话协调器行为
class MockPlaybackCoordinator {
  constructor(dataStore) {
    this.dataStore = dataStore;
    this.currentSession = null;
    this.lastSaveTimestamp = 0;
  }

  getCurrentSession() {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  async startSession(initData) {
    this.currentSession = {
      ...initData,
      isPlaying: true,
    };
    await this.syncToHistoryStore();
    return { ...this.currentSession };
  }

  async updateProgress(progress) {
    if (!this.currentSession) return;
    this.currentSession.positionSeconds = progress.positionSeconds;
    if (typeof progress.durationSeconds === 'number') {
      this.currentSession.durationSeconds = progress.durationSeconds;
    }
    const now = Date.now();
    if (now - this.lastSaveTimestamp > 50) {
      this.lastSaveTimestamp = now;
      await this.syncToHistoryStore();
    }
  }

  async closeSession() {
    if (this.currentSession) {
      await this.syncToHistoryStore();
      this.currentSession = null;
    }
  }

  async syncToHistoryStore() {
    if (!this.currentSession) return;
    const { seriesId, seriesTitle, episodeId, episodeNumber, episodeTitle, positionSeconds, durationSeconds } =
      this.currentSession;

    const progressPercentage =
      durationSeconds > 0 ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100)) : 0;

    await this.dataStore.saveHistory({
      seriesId,
      seriesTitle,
      episodeId,
      episodeNumber,
      episodeTitle,
      positionSeconds,
      durationSeconds,
      progressPercentage,
      updatedAt: Date.now(),
    });
  }
}

test('PlaybackSessionCoordinator offline unit tests', async (t) => {
  const testBaseDir = await fs.mkdtemp(path.join(tmpdir(), 'coord_test_'));
  const ds = new DataStore(testBaseDir);
  await ds.load();

  const coordinator = new MockPlaybackCoordinator(ds);

  await t.test('1. Starts session and records initial playback to history', async () => {
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
    assert.equal(session.isPlaying, true);

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].seriesId, 'series_99');
    assert.equal(history[0].episodeNumber, 1);
  });

  await t.test('2. Progress updates throttle sync to history store', async () => {
    // 模拟多次微小进度跳动
    await coordinator.updateProgress({ positionSeconds: 10, durationSeconds: 120 });
    await new Promise((r) => setTimeout(r, 60)); // 等待超过 50ms 节流门限
    await coordinator.updateProgress({ positionSeconds: 25, durationSeconds: 120 });

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].positionSeconds, 25);
  });

  await t.test('3. Closing session commits final position', async () => {
    await coordinator.updateProgress({ positionSeconds: 78.5, durationSeconds: 120 });
    await coordinator.closeSession();

    assert.equal(coordinator.getCurrentSession(), null);

    await ds.flushAsync();
    const history = await ds.getHistory();
    assert.equal(history[0].positionSeconds, 78.5);
  });

  await fs.rm(testBaseDir, { recursive: true, force: true });
});
