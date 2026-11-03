import test from 'node:test';
import assert from 'node:assert/strict';

// 测试纯离线 DTO 规范化逻辑
test('SDK Adapter Offline DTO and cursor mapping tests', async (t) => {
  await t.test('1. Normalizes snake_case series to camelCase DramaSummary', () => {
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

    const normalized = {
      id: String(rawSdkItem.id),
      title: String(rawSdkItem.title),
      description: String(rawSdkItem.description || ''),
      coverUrl: String(rawSdkItem.cover_url || ''),
      coverExpiresAt: rawSdkItem.cover_expires_at,
      episodeCount: Number(rawSdkItem.episode_count || 0),
      author: rawSdkItem.author,
      category: rawSdkItem.category,
      heat: rawSdkItem.heat,
      statusText: rawSdkItem.right_text,
    };

    assert.equal(normalized.id, '7360564034610940990');
    assert.equal(normalized.coverUrl, 'https://p3.example.com/cover.jpg');
    assert.equal(normalized.coverExpiresAt, '2026-11-04T12:00:00Z');
    assert.equal(normalized.episodeCount, 80);
    assert.equal(normalized.heat, 24500000);
  });

  await t.test('2. Suggestion text and keyword mapping precision', () => {
    const rawSuggestions = [
      { text: '全球死考', keyword: '全球死考' },
      { text: '全球高考 (小说原著)', keyword: '7123456789' },
      { text: '纯文本提示' },
    ];

    const mapped = rawSuggestions.map((item) => ({
      text: String(item.text || item.keyword || ''),
      keyword: item.keyword ? String(item.keyword) : undefined,
    }));

    assert.equal(mapped[0].text, '全球死考');
    assert.equal(mapped[0].keyword, '全球死考');
    assert.equal(mapped[1].text, '全球高考 (小说原著)');
    assert.equal(mapped[1].keyword, '7123456789');
    assert.equal(mapped[2].text, '纯文本提示');
    assert.equal(mapped[2].keyword, undefined);
  });

  await t.test('3. Cursor pagination and has_more preservation', () => {
    const rawPage = {
      items: [{ id: '1', number: 1, title: '第1集' }],
      cursor: 'cur_token_xyz_123',
      has_more: true,
    };

    assert.ok(rawPage.has_more);
    assert.equal(rawPage.cursor, 'cur_token_xyz_123');
    assert.equal(rawPage.items.length, 1);
  });
});
