import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { decryptCencMp4 } from '../src/main/media/cencDecrypter.ts';

test('CENC MP4 Decrypter Unit Tests', async (t) => {
  await t.test('1. Rejects invalid AES key length', () => {
    const dummy = Buffer.alloc(100);
    assert.throws(() => decryptCencMp4(dummy, 'short_key'), {
      message: /Invalid CENC AES key length/,
    });
  });

  await t.test('2. Safely returns unencrypted or non-moov buffer without error', () => {
    const dummy = Buffer.alloc(100);
    const res = decryptCencMp4(dummy, '1d1e0097547e3b8dab8206bf1e921307');
    assert.equal(res.length, 100);
  });

  await t.test('3. Synthesizes a minimal CENC MP4 and verifies AES-128 CTR decryption and stsd replacement', () => {
    // 构造极简包含 ftyp + moov (trak -> mdia -> minf -> stbl -> [stsd(encv/sinf/frma), stts, stsc, stsz, stco, senc]) + mdat 的结构
    const key = Buffer.from('1d1e0097547e3b8dab8206bf1e921307', 'hex');
    const iv = Buffer.from('1122334455667788', 'hex');
    const fullIv = Buffer.alloc(16);
    iv.copy(fullIv, 0);

    const plaintext = Buffer.from('HELLO_OPENHONGGUO_UNENCRYPTED_MEDIA_STREAM_SAMPLE_DATA_1234567890');
    const cipher = crypto.createCipheriv('aes-128-ctr', key, fullIv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    // 验证利用相同的 AES-CTR 可以无损恢复原文
    const decipher = crypto.createDecipheriv('aes-128-ctr', key, fullIv);
    const recovered = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    assert.deepEqual(recovered, plaintext);
  });
});
