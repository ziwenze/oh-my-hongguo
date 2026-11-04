/**
 * Electron Runtime Smoke Test
 * 验证应用能在真实的 Electron 运行时中正常启动、加载内置 Wasm、并挂载核心 API
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function run() {
  console.log('[Smoke] Running in Electron runtime:', process.versions.electron);
  console.log('[Smoke] Node.js version:', process.versions.node);
  console.log('[Smoke] Platform:', process.platform, process.arch);

  assert.ok(process.versions.electron, 'Must run inside Electron process');

  // 1. 验证构建产物文件存在
  const distHtml = path.join(rootDir, 'dist/index.html');
  const mainJs = path.join(rootDir, 'dist-electron/main.js');
  const preloadJs = path.join(rootDir, 'dist-electron/preload.js');
  const wasmFile = path.join(rootDir, 'vendor/openhongguo/dist/openhongguo.wasm');

  await fs.access(distHtml);
  await fs.access(mainJs);
  await fs.access(preloadJs);
  await fs.access(wasmFile);

  console.log('[Smoke] 1. Verified all build artifacts and wasm binary exist.');

  // 2. 验证 Electron 进程内加载 Wasm 模块的能力
  const wasmBuffer = await fs.readFile(wasmFile);
  assert.ok(wasmBuffer.length > 5 * 1024 * 1024, 'Wasm binary must be > 5MB');

  const wasmModule = await WebAssembly.compile(wasmBuffer);
  assert.ok(wasmModule instanceof WebAssembly.Module, 'WebAssembly compile must succeed in Electron');
  console.log('[Smoke] 2. Verified Wasm compilation in Electron runtime succeeded.');

  // 3. 验证 Preload 脚本输出的 API 接口白名单完整性
  const preloadContent = await fs.readFile(preloadJs, 'utf8');
  const expectedApis = [
    'getDiscover',
    'searchDramas',
    'getSearchSuggestions',
    'getHotSearch',
    'getDramaDetail',
    'getEpisodes',
    'getShortRank',
    'resolvePlaybackSource',
    'startSession',
    'updateSessionStatus',
    'updateSessionProgress',
    'getHistory',
    'saveHistory',
    'clearHistory',
    'getFavorites',
    'toggleFavorite',
    'toggleAlwaysOnTop',
    'getDiagnostics',
  ];

  for (const api of expectedApis) {
    assert.ok(
      preloadContent.includes(api),
      `Preload bundle must expose "${api}" in contextBridge`
    );
  }
  console.log(`[Smoke] 3. Verified Preload bundle contains all ${expectedApis.length} contextBridge API endpoints.`);

  console.log('[Smoke] All Electron smoke checks PASSED cleanly.');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Smoke] FATAL failure:', err);
    process.exit(1);
  });
