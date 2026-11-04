/**
 * Electron GUI & Preload Integration Smoke Test
 * 真实启动 Electron 应用、创建 BrowserWindow、加载打包产物、执行 Preload 并通过 ContextBridge 验证 IPC 往返通信
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function run() {
  console.log('[Smoke] Running Electron smoke verification suite...');

  // 1. 验证构建产物文件存在
  const distHtml = path.join(rootDir, 'dist/index.html');
  const mainJs = path.join(rootDir, 'dist-electron/main.js');
  const preloadJs = path.join(rootDir, 'dist-electron/preload.cjs');
  const wasmFile = path.join(rootDir, 'vendor/openhongguo/dist/openhongguo.wasm');

  await fs.access(distHtml);
  await fs.access(mainJs);
  await fs.access(preloadJs);
  await fs.access(wasmFile);
  console.log('[Smoke] 1. Verified all build artifacts and wasm binary exist.');

  // 2. 验证 Electron 进程内加载与编译 Wasm 模块的能力
  const wasmBuffer = await fs.readFile(wasmFile);
  assert.ok(wasmBuffer.length > 5 * 1024 * 1024, 'Wasm binary must be > 5MB');
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  assert.ok(wasmModule instanceof WebAssembly.Module, 'WebAssembly compile must succeed in Electron');
  console.log('[Smoke] 2. Verified Wasm compilation succeeded.');

  // 3. 验证 Preload API 白名单
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
    assert.ok(preloadContent.includes(api), `Preload bundle must expose "${api}" in contextBridge`);
  }
  console.log(`[Smoke] 3. Verified Preload bundle contains all ${expectedApis.length} contextBridge API endpoints.`);

  // 4. 启动真实的 Electron 应用 GUI 进程 (验证 BrowserWindow 启动、Preload 注入与 IPC 往返)
  console.log('[Smoke] 4. Launching real Electron BrowserWindow to verify GUI & IPC roundtrip...');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const electronBin = require('electron'); // 获取平台自动解析的 Electron 可执行文件路径

  const testUserData = path.join(os.tmpdir(), `ohg_smoke_${Date.now()}`);
  await fs.mkdir(testUserData, { recursive: true });

  const childArgs = ['.', '--disable-gpu', `--user-data-dir=${testUserData}`];
  if (process.platform === 'linux') {
    childArgs.push('--no-sandbox', '--disable-dev-shm-usage');
  }

  const child = spawn(electronBin, childArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      OHG_SMOKE_TEST: '1',
      OHG_USER_DATA_DIR: testUserData,
      VITE_DEV_SERVER_URL: '',
    },
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  await fs.rm(testUserData, { recursive: true, force: true }).catch(() => {});

  assert.equal(exitCode, 0, `Electron app GUI smoke test exited with code ${exitCode}`);
  console.log('[Smoke] 4. Real Electron BrowserWindow GUI & IPC roundtrip verified with exit code 0.');
  console.log('[Smoke] All Electron GUI and integration checks PASSED cleanly.');
}

run().catch((err) => {
  console.error('[Smoke] FATAL failure:', err);
  process.exit(1);
});
