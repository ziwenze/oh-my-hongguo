/**
 * Stage 0 PoC Inspection Script
 * 仅用于验证本地 SDK 初始化、样本短剧搜索、分集元数据与播放流模型特征。
 * 敏感数据均做脱敏处理，严禁输出明文密钥。
 */
import { createClient, fileProfileStore } from '../vendor/openhongguo/index.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function run() {
  const profilePath = join(tmpdir(), 'ohg_poc_profile.json');
  console.log('[PoC] 1. Initializing SDK Client with profile:', profilePath);
  const client = await createClient({ profile: profilePath });
  console.log('[PoC] 1. SDK Wasm initialized successfully.');

  console.log('[PoC] 2. Querying sample search...');
  const searchRes = await client.search('绝世');
  console.log(`[PoC] 2. Found ${searchRes.items.length} sample items.`);
  if (searchRes.items.length === 0) return;

  const sampleDrama = searchRes.items[0];
  console.log(`[PoC] 3. Target drama: "${sampleDrama.title}" (ID: ${sampleDrama.id})`);

  const epRes = await client.listEpisodes(sampleDrama.id, { limit: 5 });
  console.log(`[PoC] 3. Episodes retrieved: ${epRes.items.length} items (Total in drama: ${sampleDrama.episode_count ?? 'N/A'})`);
  if (epRes.items.length === 0) return;

  const sampleEp = epRes.items[0];
  console.log(`[PoC] 4. Resolving playback for Episode 1 (ID: ${sampleEp.id})...`);
  try {
    const pbRes = await client.resolvePlayback(sampleEp.id);
    console.log('[PoC] 4. Playback resolved:');
    console.log(`       - Protected: ${pbRes.playback?.protected}`);
    console.log(`       - Streams Count: ${pbRes.playback?.streams?.length ?? 0}`);
    if (pbRes.contentKey) {
      console.log(`       - ContentKey: Derived successfully (16-byte key sanitized)`);
    }
    if (pbRes.playback?.streams?.length > 0) {
      const s0 = pbRes.playback.streams[0];
      console.log(`       - Sample Stream 0: [${s0.definition}] Codec: ${s0.codec}, Encryption: ${s0.encryption || 'none'}`);
    }
  } catch (err) {
    console.warn(`[PoC] 4. Playback resolution returned constraint status: ${err.code || err.message}`);
  }
}

run().catch((err) => {
  console.error('[PoC] Fatal error:', err);
  process.exit(1);
});
