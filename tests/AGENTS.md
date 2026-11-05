# Tests 模块开发指导

> 生效目录：`tests/`；同时遵守根目录 `AGENTS.md`。

## 测试分层及入口

| 层级 | 主要文件 / 命令 | 验证目标 |
| --- | --- | --- |
| 离线单元测试 | `*.test.mjs` / `npm test` | SDK DTO、DataStore、Session、CENC 算法与边界 |
| Electron GUI 冒烟 | `electronSmoke.mjs` / `npm run test:smoke` | 主窗口、Preload、IPC、本地媒体、PiP 创建/接力 |
| 打包应用验收 | `packagedRuntimeSmoke.mjs` / `npm run test:packaged` | 真实打包二进制、Wasm、独立进程重启与持久化 |
| 打包与发行 CI | `.github/workflows/package-validation.yml`、`release.yml` | 平台产物、资源完整性、校验值、发布资产 |
| 真机验收 | `docs/DEVICE_VERIFICATION_GUIDE.md` | 安装、签名提示、实际声音/解码、卸载 |

## 强制测试原则

1. Bug 修复应有一个能证明原有缺陷的回归用例；测试新行为的同时测试旧消息/错误/超时/关闭后的行为。
2. 区分 **存在性检查、启动成功、真实业务调用、视频播放、首帧、音频独占、设备安装**，不要将上一层成功描述为下一层完成。
3. 单测必须直接调用待测生产函数，不只验证其依赖库（例如仅验证 AES-CTR 往返不能证明 `decryptCencMp4()` 正确）。
4. 优先使用 `tests/fixtures/sample.webm` 等有合法使用权的离线测试固件和 Mock SDK；不依赖随机远程样例站点或真实平台高频访问。
5. 对 CENC/MP4 使用授权、可重复的标准向量及预期输出；增加异常 box、越界 Range、响应超限等负例。
6. GUI 测试需要真正的 Renderer frame / Preload 桥接，不能仅从 Node 进程直接调用被测业务函数后声称 GUI 已通过。
7. 打包测试必须以打包后的可执行程序启动，并用独立临时 `cwd` / `userData`；不要意外从源码路径读取 fixture 或依赖。
8. 改动 Session/PiP 必须覆盖迟到 Token、错误 Ack、销毁窗口、重复点击、超时回滚、播放中的音量调整与会话返回。
9. 测试隔离使用临时目录并在完成后清理；不得在开发者真实 `userData`、真实收藏及匿名凭据上运行破坏性用例。
10. 没有观察到结果就不要写 PASS；非当前平台的打包、设备、签名与公证必须标记“未验证”。

## 运行顺序

- 通用：`npm run typecheck` → `npm test` → `npm run build`。
- Electron 改动：追加 `npm run test:smoke`（需要窗口图形环境；Linux CI 使用 xvfb）。
- 打包改动：当前系统先执行 `npm run dist:dir`，再 `npm run test:packaged`；Windows/macOS 各自 Runner 的产物只能证明各自平台。
- `npm run test:poc` 是真实网络探测，不属于默认单测/CI；仅经任务明确授权后执行。
- 文档改动：至少核对源码中的路径、命令、环境变量、版本、Release 文件名；不得把“未运行测试”藏在交付摘要里。

## 断言质量与报告

- 测试必须可复现、带有边界负例；不要用固定 sleep 代替明确状态同步，除非测试本身就是超时行为。
- 失败时输出诊断但不泄漏媒体密钥、签名 URL 或真实用户数据；测试固件不提交不具备分发授权的内容。
- 回归报告写明命令、平台、实际结果和未测试范围；可将缺失的真机/授权条件记录为后续验收项。
