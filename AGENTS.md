# AGENTS.md — Oh-My-Hongguo 工程协作契约

> 适用范围：本仓库全部目录；子目录的 AGENTS.md 对该目录额外生效。
> 读者：Codex、Claude Code、Cursor、其他 AI 编程助手及人工贡献者。
> 目标：维护**已经发布的桌面应用**，以小范围、可验证的变更修复缺陷、扩展功能和安全发行。本文不是阶段开发计划或待办列表。

## 1. 每次任务的工作方式

1. **先核对现状**：查看当前分支、相关源码、测试和近期提交；不要根据旧对话或旧文档猜测实现状态。
2. **定位责任边界**：阅读根规范及受影响目录下的 AGENTS.md；按本文件的模块路由定位上下游。
3. **定义可观察的验收结果**：Bug 先复现或建立失败回归用例；功能先明确正常、错误和取消/竞态路径。简易修改不必写长计划。
4. **做最小正确变更**：只触碰必要文件，保留既有公开 API、用户数据、快捷键及跨窗口协议；如需破坏兼容，说明原因和迁移方案。
5. **验证影响面**：类型、单测、GUI 冒烟及打包运行测试按改动范围选择；不能运行的项目必须明确标注“未运行”。
6. **如实交付**：说明改动、影响文件、执行命令与结果、未验证部分、已知风险；不以编译或 CI 全绿替代真机/真实媒体验收。

不要为了通过测试而删除断言、增加宽松超时成功分支、吞掉异常，或把 Mock 的成功描述为真实平台成功。未经请求不要顺手做大规模重构、升级 Electron 主版本或发布版本。

## 2. 事实来源与文档职责

- **当前源码 + package.json + 锁文件**：实际运行方式、依赖版本和接口的首要依据。
- **当前测试与 CI 日志**：已验证行为的证据；未覆盖的场景不能声称通过。
- **README.md / GitHub Releases**：面向用户的功能、系统要求与下载说明；更新时应与实际发布资产一致。
- **docs/PRD.md**：产品意图；**docs/ARCHITECTURE.md**：设计背景；**docs/FEASIBILITY.md**：历史探测与限制；**docs/ROADMAP.md**：里程碑与验收级别。
- **vendor/openhongguo/**：项目固定的 SDK 版本和类型契约；未经专项需求不得修改或重生成。
- 遇到文档与源码冲突：先指出差异并以可验证的实际行为为准，修改相关文档；不得为满足过时文字而回退已实现功能。
- 使用 `Implemented` / `CI Verified` / `Device Verified` 时需匹配对应证据。历史阶段状态不属于本文件的长期规则。

## 3. 模块导航（按任务读取，而非全文加载）

| 任务类型 | 主要入口 | 关联检查 |
| --- | --- | --- |
| SDK、推荐、搜索、榜单、分集、错误码 | `src/main/sdk/adapter.ts` | `vendor/openhongguo/`、`src/shared/types.ts`、`tests/sdkAdapter.test.mjs` |
| 主进程、IPC、新增跨进程 API | `src/main/index.ts` | `src/preload/index.ts`、`src/shared/types.ts`、`src/renderer/` |
| 会话身份、切集、进度与续播 | `src/main/session/` | `src/renderer/components/PlayerModal.tsx`、`src/main/store/` |
| 主窗、PiP、所有权和接力 | `src/main/windows/` | `src/main/session/`、`src/renderer/views/PiPPlayerView.tsx` |
| 媒体源、CENC、回环代理、Range | `src/main/media/` | `src/main/sdk/adapter.ts`、`src/renderer/player/` |
| UI、播放器生命周期、交互与状态 | `src/renderer/` | `src/preload/`、`src/main/`、`src/shared/` |
| 收藏、历史、原子写、迁移 | `src/main/store/dataStore.ts` | `src/renderer/store/`、`tests/dataStore.test.mjs` |
| 自动化测试与测试固件 | `tests/` | 受影响的生产模块和相关测试 |
| 安装包、签名、自动化发布 | `electron-builder.json`、`.github/workflows/` | `scripts/afterPack.cjs`、`tests/packagedRuntimeSmoke.mjs` |

具体的模块不变量、风险和测试见：
- [媒体模块](src/main/media/AGENTS.md)
- [会话模块](src/main/session/AGENTS.md)
- [窗口模块](src/main/windows/AGENTS.md)
- [React 与渲染模块](src/renderer/AGENTS.md)
- [测试模块](tests/AGENTS.md)

## 4. 跨模块不变量（不可悄悄改变）

- **信任边界**：Renderer 不直接使用 Node、文件系统、SDK 或内容密钥。Electron 窗口坚持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`；Preload 只暴露最小化白名单，主进程校验 sender/origin 和不可信入参。
- **SDK 隔离**：只由 Main/Adapter 访问 `openhongguo` 和 Go Wasm；上游 snake_case 在 Adapter 映射为稳定 DTO。分页游标和真实错误语义不可凭空造假。
- **单活跃会话**：状态更新必须匹配 sessionId、generation、ownerWindowId；过期或跨窗口事件不得覆盖新会话。主窗/PiP 所有权移交必须确认暂停、处理失败并保持进度。
- **React 媒体生命周期**：拥有 video adapter 的 Effect 不能因音量、回调或 UI 状态更新而销毁播放器。异步切集、检索及媒体加载需防旧代际回写。
- **存储正确性**：维护 JSON schema、异步持久化顺序、临时文件/备份和退出刷盘次序；不无故改变 `userData` 默认位置，不把“正常退出保存”表述成强杀/断电零丢失。
- **受控媒体与回环服务**：限制外部媒体请求的来源、大小、超时、并发和缓存预算；不得泄露密钥、签名、设备凭据或完整临时 CDN URL。仅处理拥有适当授权的内容，不新增绕过访问控制/DRM 的路径。
- **兼容与发行**：检查打包后 Preload、Wasm 和运行时路径；不得从 CI Runner 名称推断所有 CPU 架构兼容。发版不能省略签名状态、用户数据影响及资产校验。

## 5. 技术与代码约定

- 依赖事实以 `package.json` 为准；当前采用 Electron、React、TypeScript、Vite、Tailwind、Zustand、npm lockfile。本地 SDK 通过 `file:./vendor/openhongguo` 引用。
- TypeScript 严格模式；新边界入参先视为 `unknown` 并验证，不以 `as any` 绕过不可信数据校验。
- 尊重现有 TS/ESM、2 空格、单引号和分号风格；跨模块导入路径按现有构建约定。组件单一职责，避免把主进程策略堆进 `App.tsx`。
- 事件监听、计时器和视频资源必须正确释放；任何异步操作考虑重复触发、用户关闭、超时、失败及卸载。
- 新依赖需说明必要性、平台兼容、包大小与风险；同步更新 `package-lock.json`。不要未经要求修改 `vendor/`。

## 6. 验证矩阵

| 修改范围 | 最低验证 | 额外验证 |
| --- | --- | --- |
| 文档/注释（无代码变化） | 核对路径、命令、版本、真实资产 | 无需声称运行了代码测试 |
| TS/React/SDK 业务逻辑 | `npm run typecheck`、`npm test`、`npm run build` | 受影响的 Electron GUI 行为执行 `npm run test:smoke` |
| 会话、PiP、Preload、媒体 | 上述 + `npm run test:smoke` | 改动影响包内运行时需 `npm run dist:dir` 后 `npm run test:packaged` |
| 数据存储与跨进程恢复 | 上述 + 存储并发/重启回归用例 | 打包运行时的两进程恢复测试 |
| 打包、升级、发行配置 | 类型/构建 + `npm run dist:dir` / Package Validation | 对应平台真实安装包、SHA-256、签名及 Device 验收 |

常用命令：`npm ci`、`npm run dev`、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:smoke`、`npm run dist:dir`、`npm run test:packaged`。
- GUI 测试需要 Electron/图形环境；Linux CI 使用 xvfb。打包运行测试依赖当前平台构建出的 `release/` 目录。
- `npm run test:poc` 访问真实服务，**不是默认测试**；无明确任务与访问权限不得为了验证而频繁调用真实接口。
- 不伪造实机/签名/公证/真实媒体结论，也不随意重跑会产生正式 Tag/Release 的工作流。

## 7. 提交、文档和发行规则

- Bug 修复尽量先加能在旧行为下失败的回归测试；新功能覆盖正常/错误/竞态路径。
- 只在对外行为、协议、数据格式或操作方式变化时同步 README、相关 docs；不要在 AGENTS 中维护阶段进度和实时 Bug 列表，它们属于 Issues/PR。
- 提交使用 `fix:`、`feat:`、`refactor:`、`test:`、`docs:`、`ci:` 等清晰前缀。不要在非发版任务中修改版本号、生成正式 Tag 或发布 Release。
- 用户文案不得无依据承诺“零延迟”“绝不丢失”“全面硬解”“不留痕迹”；发布支持平台必须与实际二进制架构一致。
- 交付时写清：**改了什么 / 为什么 / 如何验证 / 尚未验证什么 / 后续风险**。

**总原则：尊重已发布产品的现有行为，先理解跨模块依赖，再做最小可回归变更；以可观测证据而非阶段性叙述判断完成。**
