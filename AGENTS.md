# AGENTS.md — Oh-My-Hongguo 工程协作规范

> 适用范围：本仓库全部目录。供 Codex、Claude Code、Cursor 等 AI 编程助手及贡献者参考。
> 目标：依照现有 PRD、架构和实际源码，以可验证的小步提交推进工程。本文是工作约束，不代表功能已实现。
> 最后对照基线：2026-11-04；若仓库发生更新，始终先检查当前代码与 Git 历史。

## 1. 开始工作前先读什么

按任务读取必要文档，避免机械加载全部上下文：

| 文件 | 权威范围 |
| --- | --- |
| docs/PRD.md | 产品目标、页面、交互、功能及验收需求（做什么） |
| docs/ARCHITECTURE.md | 进程边界、媒体引擎、数据模型、技术栈、安全约束（怎么做） |
| docs/FEASIBILITY.md | 已观测事实、环境限制、播放可行性和 Go/No-Go 结论（哪些被验证） |
| docs/ROADMAP.md | 开发阶段、当前里程碑、准入与准出标准（何时做） |
| README.md | 项目定位、声明、实际进展和对外说明 |
| vendor/openhongguo/README.md、index.d.ts、types.d.ts | 本地固定的 SDK 真实 API 契约 |
| scripts/poc_inspect.mjs | 阶段 0 探测脚本；运行前确认它会请求真实服务 |

文档不是运行证据：若描述与 SDK 类型或运行结果冲突，先指出差异，再更新设计和代码；不得凭空补齐上游能力。重大架构取舍先形成简短决策说明（可新建 docs/ADR-*.md），不要静默改变路线。

## 2. 当前事实与范围

- 当前属于 Pre-Alpha；阶段 0 只对元数据浏览给出 Conditional Go，媒体播放准入仍未通过。
- 阶段 1 已有 Electron/React/Vite 脚手架、SDK Adapter、Preload IPC、DataStore；这些是初版实现，**不等于通过完整运行、构建或安全验收**。
- 阶段 2 的发现、搜索、详情、选集、收藏已有部分 UI；无限滚动、频道选择、完整搜索与榜单等还需实现和验证。
- 阶段 3 的完整播放器、无缝接力、独立置顶小窗尚未完成；现有窗口置顶功能不等于独立 PiP 小窗。
- 开发优先顺序：修复阶段 1 的正确性与安全性 → 完成阶段 1 验收 → 按 ROADMAP 推进阶段 2 → 在授权及技术验证成立后再开展受保护媒体方案。
- 不准将计划功能描述为已实现；没有实测证据不要声称“稳定”“零延迟”“全平台兼容”。

## 3. 固定技术栈与项目结构

当前 package.json 为技术实现的版本事实来源；调整依赖要解释原因并同步锁文件。

- 桌面：Electron 45.2.1（目前 pin 的版本），主进程 Node API；不要随意升级主版本。
- UI：React 19、TypeScript 5.x、Vite 6.x、Tailwind CSS 3.x、Lucide React；状态管理规划使用 Zustand 5。
- 本地 SDK：vendor/openhongguo，Node ESM 包 + Go Wasm；通过本地 file 依赖引用，不在渲染进程直接调用。
- 数据：应用 userData 目录下本地 JSON；阶段 1 暂不引入远程数据库。
- 构建/包管理：npm + package-lock.json；打包与平台验证尚在路线图中。

目录职责（以后新增代码继续遵守）：

- src/main/：Electron 生命周期、主进程业务编排、窗口、SDK、持久化及可信资源访问。
- src/main/sdk/：对上游 SDK 的适配，负责字段规范化与错误映射。
- src/main/store/：本地数据模型的加载、保存、备份、恢复与迁移。
- src/preload/：最小权限的 contextBridge API，不暴露 ipcRenderer 或任意 Node 能力。
- src/renderer/：React 展示与用户交互，不直接访问文件系统、SDK 或私有密钥。
- src/shared/：可序列化、跨进程共享的 DTO、类型和稳定错误码。
- scripts/：明确区分离线测试脚本与真实联网探测脚本。
- vendor/：视为第三方固定快照；未经专项任务不要修改、格式化或批量重写。

新增模块尽量沿既有分层，不在 App.tsx 持续堆放数据、存储、网络或播放策略。跨窗口状态由主进程协调，渲染端只持有必要的 UI 状态。

## 4. SDK 契约：禁止猜测

- 首选检查本地 vendor/openhongguo 的 index.d.ts、types.d.ts；与上游新版本不一致时，以本仓库固定版本为准。
- listEpisodes 使用 { cursor, pageSize }；**禁止写 offset/limit 作为 SDK 参数**。分页要保留 next cursor、has_more、加载状态与去重；不可凭总集数虚构分集 ID。
- discover 的 channel 必须确实传入 SDK，不能只在上层定义参数。
- Suggestion 的 text 是显示文字，keyword 可能是搜索词或直达 ID；映射时不要混为一谈。
- Node SDK 返回字段通常为 snake_case（如 cover_url、episode_count、has_more）；只在 Adapter 层转成 camelCase DTO。
- cover_expires_at 是 RFC 3339 字符串；播放 expires_at 是 Unix 秒数。校验过期后重新请求，勿永久缓存完整 CDN URL。
- 清晰度、编码、音轨、加密属性以真实 streams / playback 返回为准；不写死 1080p/720p，也不假设所有媒体是普通 MP4。
- SDK 客户端初始化要并发安全（共享 in-flight Promise），避免多个 IPC 同时首次调用时重复初始化。
- 保留上游错误码与 retryable/retryAfterMs 语义，区分空数据、限流、登录要求、内容下架、网络失败。禁止盲目自动重试。

## 5. 进程、安全与授权边界（强制）

- webPreferences 保持 sandbox: true、contextIsolation: true、nodeIntegration: false。
- IPC 通道采取明确白名单；主进程验证 senderFrame 和输入参数；不能因为 TypeScript 声明存在就跳过运行时校验。
- 只允许可信的本地应用 origin；外部导航和 shell.openExternal 必须校验 URL 协议及准确的 origin/hostname，不使用 startsWith('http://localhost') 作为安全边界。
- 对 CSP、远程图片、媒体域名和导航设置最小必要权限；不为排障随意关闭隔离或扩大到任意远程脚本。
- 不将匿名设备标识、请求签名、完整带参数 CDN URL、内容密钥写入日志、截图、Issue、测试快照或提交记录。
- 严格区分 Apache 2.0 的代码许可与第三方内容、接口使用权。未经适当授权，不实现绕过平台访问限制或受保护媒体保护机制的功能。
- 遇到 ANONYMOUS_LIMITED / RATE_LIMITED 时尊重平台限制、停止相应自动请求并展示状态；不自动轮换设备以维持播放或规避频控。
- 媒体播放仍属 Playback Gate Pending：普通、未受保护且获得使用授权的测试流可先验证。任何 EME、ClearKey、外部播放器路径必须经可行性及合规评估后再纳入产品。
- 普通通用 IPC 不允许广播原始 DRM 密钥；不得声称所谓“封闭管道”本身已构成密钥不可提取的保证。

## 6. TypeScript、React 与代码风格

- 遵循现有风格：2 空格缩进、单引号、语句末分号、ES Module；本地 TS 跨模块导入按既有构建约定使用 .js 后缀。
- 启用 strict 类型检查；新代码不增加 any。边界数据先视为 unknown，再验证并转换；不得用类型断言掩盖不可信输入。
- 组件/类型用 PascalCase，变量/方法用 camelCase，常量可用 UPPER_SNAKE_CASE；单文件保持单一明确职责。
- 异步操作必须处理 loading、empty、error、取消/过期响应与组件卸载。搜索联想、分页和详情加载防止旧请求结果覆盖新选择。
- 列表使用稳定业务 ID 作 key；图片要有错误占位和过期处理；避免无必要的全局键盘监听、误触和触控板惯性连切。
- 优先复用现有依赖与设计 token；新增依赖说明用途、体积/安全影响和替代方案；不要为小功能引入大型框架。
- 对外错误信息简洁易理解，内部日志脱敏；不要吞掉错误后把空列表误当作正常返回。

## 7. DataStore 和媒体会话的质量要求

- 持久化操作必须串行化；不能让异步 persist 与退出时 flushSync 争用同一个 .tmp 文件。
- 仅做 rename 不等于所有平台/断电条件下绝对安全。写入、备份更新及恢复要有明确顺序、失败处理和测试；恢复失败不要静默抹除已有损坏数据。
- 持久化 schema 必须有版本号与迁移策略；历史进度、收藏变化必须保证不互相丢失。缓存图片 URL 可丢弃，稳定剧集 ID 不可丢弃。
- 主窗与独立小窗不能共享同一个 DOM video；若实现播放接力，应使用主进程会话状态机并验证“只有一个窗口发声”“进度连续”“接力失败可回退”。
- 阶段 3 前不要声称实现无缝播放、HEVC 全兼容、DRM 解码或硬件加速；保留功能标记与友好不可用状态。

## 8. 测试、验证和交付门槛

每项功能应同时说明行为与验收方式。优先使用可重复的离线单元测试和 Mock SDK 数据；禁止通过不断请求真实平台来补足测试。

常用项目命令：
- npm ci：按 lockfile 安装依赖（需要联网及合适的运行环境）。
- npm run dev：开发启动，需人工确认主窗口和 Preload 实际工作。
- npm run build：现有构建命令；**当前 tsconfig 只包含 renderer/shared，不代表 main/preload 已完成类型检查**。优先补充独立 tsconfig 或检查命令。
- npm run test:poc：真实网络探测，可能触发平台限制；仅在任务明确需要、遵守访问权限与频率约束时手动运行，不作为默认 CI 测试。

至少覆盖：
1. SDK DTO 映射、cursor 分页、空数据和错误码；
2. IPC sender 与入参校验、非法 URL 与导航拒绝；
3. DataStore 并发写、异常退出、坏 JSON、备份恢复和 schema 迁移；
4. React 搜索竞态、分页去重、错误/空态、收藏与状态回显；
5. 开发模式、生产构建及最终打包后的 Wasm/Preload 资源路径；
6. 有条件的 macOS arm64 / x64、Windows x64 / arm64 实机验证。

不能运行的命令或平台测试需在交付说明中写清“未运行”和原因；不可填写虚假的 PASS。

## 9. 每次任务的标准工作流

1. **定位**：读取相关 PRD/ARCHITECTURE/FEASIBILITY/ROADMAP 章节与现有代码，确认当前阶段和范围。
2. **计划**：用简短任务清单列出修改文件、接口影响、边界条件和验收方法。小修补可以直接实施。
3. **实现**：小步改动，只修改与任务相关的文件；优先修复根因，不以临时绕过掩盖错误；不未经要求修改 vendor。
4. **验证**：运行可用的类型检查、构建、离线测试及必要的人工冒烟测试；修复新引入的问题。
5. **文档同步**：只在行为、接口、状态或阶段确实变化时更新对应文档；完成验收前不打勾。
6. **交付摘要**：报告修改内容、影响文件、已运行命令与结果、未运行项目、仍有风险、建议下一步。提交信息使用清楚的前缀，如 feat:、fix:、refactor:、test:、docs:、chore:。

## 10. 当前优先处理的技术债

此列表是审阅时的待办提醒，不替代最新 Issue/代码；每次实施前重新检查是否已修复。

- DataStore persist / flushSync 并发安全与备份恢复测试。
- IPC senderFrame、参数校验、外部导航 origin 白名单与 CSP 收紧。
- main/preload 的独立 TypeScript 检查及 Electron 沙箱 Preload 冒烟测试。
- SDK Adapter 的 discover channel 透传、Suggestion.text/keyword 映射、播放模型的占位 seriesId/episodeNumber。
- React 数据请求竞态、首页分页、空态和错误反馈。
- 明确现有“主窗口置顶”不等于 PRD 的独立小窗；播放与续播交互不可用时应明确标识占位。

原则：**先正确、可测、安全，再丰富功能；以已验证的运行行为推进里程碑，不以文档写完或代码存在代表已完成。**
