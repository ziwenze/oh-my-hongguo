import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDramaSummary,
  normalizeEpisodeItem,
  normalizeSuggestionItem,
  normalizeRankItem,
  normalizePlaybackSource,
} from '../src/main/sdk/adapter.ts';

test('SDK Adapter Production DTO Mapping tests', async (t) => {
  await t.test('1. normalizeDramaSummary: sanitizes snake_case, big numbers, and missing fields', () => {
    const rawSdkItem = {
      id: 7360564034610940990n,
      title: '绝世战神',
      description: '战神回归都市',
      cover_url: 'https://p3.example.com/cover.jpg',
      cover_expires_at: '2026-11-04T12:00:00Z',
      episode_count: 80,
      author: '番茄作者',
      category: '都市逆袭',
      heat: 24500000,
      right_text: '全80集',
    };

    const res = normalizeDramaSummary(rawSdkItem);

    assert.equal(res.id, '7360564034610940990');
    assert.equal(res.title, '绝世战神');
    assert.equal(res.coverUrl, 'https://p3.example.com/cover.jpg');
    assert.equal(res.coverExpiresAt, '2026-11-04T12:00:00Z');
    assert.equal(res.episodeCount, 80);
    assert.equal(res.heat, 24500000);
    assert.equal(res.statusText, '全80集');

    // 边界情况：空对象或异常值
    const emptyRes = normalizeDramaSummary(null);
    assert.equal(emptyRes.id, '');
    assert.equal(emptyRes.title, '');
    assert.equal(emptyRes.episodeCount, 0);
  });

  await t.test('2. normalizeEpisodeItem: sets fallback seriesId, title, and booleans', () => {
    const rawEp = {
      id: 'ep_12345',
      number: 5,
      playable: false,
      is_new: true,
      cover_url: 'https://p3.example.com/ep5.jpg',
    };

    const res = normalizeEpisodeItem(rawEp, 'series_default');
    assert.equal(res.id, 'ep_12345');
    assert.equal(res.seriesId, 'series_default');
    assert.equal(res.number, 5);
    assert.equal(res.title, '第5集');
    assert.equal(res.playable, false);
    assert.equal(res.isNew, true);
    assert.equal(res.coverUrl, 'https://p3.example.com/ep5.jpg');
  });

  await t.test('3. normalizeSuggestionItem: preserves text and optional keyword', () => {
    const item1 = normalizeSuggestionItem({ text: '全球死考', keyword: '全球死考' });
    assert.equal(item1.text, '全球死考');
    assert.equal(item1.keyword, '全球死考');

    const item2 = normalizeSuggestionItem({ text: '全球高考 (小说)', keyword: '7123456789' });
    assert.equal(item2.text, '全球高考 (小说)');
    assert.equal(item2.keyword, '7123456789');

    const item3 = normalizeSuggestionItem({ title: '无关键字词条' });
    assert.equal(item3.text, '无关键字词条');
    assert.equal(item3.keyword, undefined);
  });

  await t.test('4. normalizeRankItem: formats rank badge and attributes', () => {
    const rawRank = {
      rank: 2,
      series_id: '778899',
      title: '战神崛起',
      cover_url: 'https://p3.example.com/rank2.jpg',
      score: '990万热度',
      actor: '主角张三',
      episode_count: 100,
    };

    const res = normalizeRankItem(rawRank, 1);
    assert.equal(res.rank, 2);
    assert.equal(res.seriesId, '778899');
    assert.equal(res.score, '990万热度');
    assert.equal(res.actor, '主角张三');
    assert.equal(res.episodeCount, 100);
  });

  await t.test('5. normalizePlaybackSource: safely extracts stream properties and sanitizes models', () => {
    const rawPb = {
      episode_id: 'ep_target',
      duration_seconds: 145,
      expires_at: 1793779200,
      protected: true,
      audio_url: 'https://audio.example.com/track.m4a',
      streams: [
        {
          definition: '720p',
          quality: 'high',
          codec: 'bytevc1',
          url: 'https://video.example.com/720p.mp4',
          protected: true,
          encryption: 'cenc-aes-ctr',
        },
      ],
    };

    const res = normalizePlaybackSource(rawPb, 'fallback_id');
    assert.equal(res.episodeId, 'ep_target');
    assert.equal(res.durationSeconds, 145);
    assert.equal(res.expiresAt, 1793779200);
    assert.equal(res.protected, true);
    assert.equal(res.audioUrl, 'https://audio.example.com/track.m4a');
    assert.equal(res.streams.length, 1);
    assert.equal(res.streams[0].definition, '720p');
    assert.equal(res.streams[0].encryption, 'cenc-aes-ctr');
  });
});
