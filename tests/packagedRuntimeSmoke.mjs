import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();

async function findPackagedBinary() {
  const candidates = [];
  if (process.platform === 'darwin') {
    candidates.push(
      path.join(rootDir, 'release/mac-arm64/Oh-My-Hongguo.app/Contents/MacOS/Oh-My-Hongguo'),
      path.join(rootDir, 'release/mac/Oh-My-Hongguo.app/Contents/MacOS/Oh-My-Hongguo'),
      path.join(rootDir, 'release/mac-universal/Oh-My-Hongguo.app/Contents/MacOS/Oh-My-Hongguo')
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      path.join(rootDir, 'release/win-unpacked/Oh-My-Hongguo.exe'),
      path.join(rootDir, 'release/win-ia32-unpacked/Oh-My-Hongguo.exe'),
      path.join(rootDir, 'release/win-arm64-unpacked/Oh-My-Hongguo.exe')
    );
  } else {
    candidates.push(
      path.join(rootDir, 'release/linux-unpacked/oh-my-hongguo')
    );
  }

  for (const cand of candidates) {
    if (fsSync.existsSync(cand)) {
      return cand;
    }
  }
  return null;
}

async function run() {
  console.log('[PackagedSmoke] Starting packaged application runtime acceptance suite...');

  const binaryPath = await findPackagedBinary();
  if (!binaryPath) {
    throw new Error(
      `Could not locate packaged executable binary in release/ output directory for platform ${process.platform}. Ensure 'electron-builder --dir' has been executed.`
    );
  }

  console.log(`[PackagedSmoke] 1. Found packaged executable binary: ${binaryPath}`);

  const testUserData = path.join(os.tmpdir(), `ohg_pkg_smoke_${Date.now()}`);
  await fs.mkdir(testUserData, { recursive: true });

  const commonArgs = [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${testUserData}`,
  ];
  if (process.platform === 'linux') {
    commonArgs.push('--disable-dev-shm-usage');
  }

  // --- Phase 1: 真实可执行程序冷启动、Preload API、Wasm SDK 初始化、媒体渲染与 PiP 接力 ---
  console.log('[PackagedSmoke] 2. Launching packaged application (Phase 1: GUI, Wasm, Media & PiP Handoff)...');
  const envRun1 = {
    ...process.env,
    OHG_SMOKE_TEST: '1',
    OHG_MOCK_SDK: '1',
    OHG_USER_DATA_DIR: testUserData,
    VITE_DEV_SERVER_URL: '',
  };
  delete envRun1.ELECTRON_RUN_AS_NODE;

  // 严格隔离：将打包程序工作目录直接置于干净的临时目录中，证明完全脱离仓库源码目录运行
  const child1 = spawn(binaryPath, commonArgs, {
    cwd: testUserData,
    stdio: 'inherit',
    env: envRun1,
  });

  const exitCode1 = await new Promise((resolve) => {
    child1.on('exit', (code) => resolve(code));
  });

  assert.equal(exitCode1, 0, `Packaged app Phase 1 exited with code ${exitCode1}`);
  console.log('[PackagedSmoke] Phase 1 PASSED with exit code 0.');

  // --- Phase 2: 独立进程重启，验证历史记录与收藏从磁盘真实恢复 ---
  console.log('[PackagedSmoke] 3. Restarting packaged application (Phase 2: Process Restart Data Persistence & Recovery)...');
  const envRun2 = {
    ...process.env,
    OHG_SMOKE_TEST: '1',
    OHG_MOCK_SDK: '1',
    OHG_VERIFY_RESTORE: '1',
    OHG_USER_DATA_DIR: testUserData,
    VITE_DEV_SERVER_URL: '',
  };
  delete envRun2.ELECTRON_RUN_AS_NODE;

  // 严格隔离：重启阶段同样在干净的临时目录中运行，验证磁盘真实恢复
  const child2 = spawn(binaryPath, commonArgs, {
    cwd: testUserData,
    stdio: 'inherit',
    env: envRun2,
  });

  const exitCode2 = await new Promise((resolve) => {
    child2.on('exit', (code) => resolve(code));
  });

  await fs.rm(testUserData, { recursive: true, force: true }).catch(() => {});

  assert.equal(exitCode2, 0, `Packaged app Phase 2 (Data Recovery) exited with code ${exitCode2}`);
  console.log('[PackagedSmoke] Phase 2 (Data Recovery across Process Restart) PASSED with exit code 0.');

  console.log('[PackagedSmoke] ALL packaged application runtime acceptance checks PASSED cleanly!');
}

run().catch((err) => {
  console.error('[PackagedSmoke] FATAL failure:', err);
  process.exit(1);
});
