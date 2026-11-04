# Oh-My-Hongguo 路线图与实施规范 (Roadmap v1.2)

| 版本 | 状态 | 作者 | 修订日期 |
| :--- | :--- | :--- | :--- |
| **v1.2.0** | Engineering Baseline | Oh-My-Hongguo Team | 2026-11-05 |

---

## 1. 验收状态分级规范 (Taxonomy)

为保证项目工程结论真实、求实、可测量，所有阶段与准出标准严格区分以下三级状态：
1. **[Implemented]**：功能与架构代码已完备实现并提交入库；
2. **[CI Verified]**：在 GitHub Actions 跨平台持续集成环境（Ubuntu, macOS, Windows）经由单元测试与 GUI 冒烟测试 100% 自动化验证通过；
3. **[Device Verified]**：在干净的 Windows 10/11 与 macOS 裸机环境中，对正式生成的安装包产物完成启动、渲染与人工交互验收。

---

## 2. 五阶段路线图与验收矩阵 (Milestones Matrix)

```
[阶段 0: 可行性验证] ──(达成 Conditional Go)──> [阶段 1: 工程底座搭建] ──> [阶段 2: 浏览与交互 MVP]
                                                                                │
[阶段 4: 打包发行与发布] <──────────────────── [阶段 3: 播放引擎与桌面特色] <────┘
```

### 阶段 0：可行性验证 (Feasibility Gate) —— [CI Verified]
- **目标**：验证 Wasm 加载、搜索目录、媒体编码特征、频控边界。
- **输出物**：`docs/FEASIBILITY.md` 测试报告与 `scripts/poc_inspect.mjs`。
- **结论**：达成 **元数据浏览方向 Conditional Go**，内容浏览完全可行，播放引擎分流适配。

---

### 阶段 1：工程底座搭建 (Engineering Foundation) —— [CI Verified]
- **核心任务**：
  1. 初始化 Electron 45.x (受支持稳定主版本) 与 Vite + React 19 + TypeScript + Tailwind CSS 脚手架；
  2. 封装 `vendor/openhongguo` 的 SDK Adapter，隔离 Wasm 运行时异常；
  3. 构建强类型安全的 ContextBridge IPC 通道（`window.electronAPI`）；
  4. 实现基于临时文件原子替换（Atomic Write）与备份恢复（`.bak`）的本地数据持久层。
- **准出验收标准**：
  - [x] **[CI Verified]** 秒级启动并完成双独立 TypeScript（Node/Renderer）类型编译；
  - [x] **[CI Verified]** 渲染进程调用 IPC 能够成功触发 SDK 初始化并支持确定性离线 Mock 注入；
  - [x] **[CI Verified]** DataStore 经受写入串行化、落盘版本守卫（Abort Guard）、退出刷盘与损坏归档测试。

---

### 阶段 2：内容浏览与交互 MVP (Browse & Discovery MVP) —— [CI Verified]
- **核心任务**：
  1. 现代暗色主题 UI 框架与导航栏搭建；
  2. 首页精选流、多频道分类标签切换与平滑无限滚动加载；
  3. 智能搜索框：4秒轮播热搜词、300ms 防抖输入联想、热搜榜与搜索历史；
  4. 多维度榜单页：热播榜、飙升榜、新剧榜、演员榜及专属作品页；
  5. 短剧详情展示与动态网格选集抽屉（按实际集数动态生成，支持游标分页）。
- **准出验收标准**：
  - [x] **[CI Verified]** 在无网络或频控状态下，内容浏览、多频道切换与收藏历史均 100% 独立稳定可用；
  - [x] **[CI Verified]** 关键词搜索与联想词具备请求代际 ID 防竞态串台保护；
  - [x] **[CI Verified]** 动态选集抽屉按真实游标分页加载与去重。

---

### 阶段 3：播放引擎与桌面特色体验 (Playback & Desktop Features) —— [CI Verified / Device Pending]
- **核心任务**：
  1. 接入两层 Media Engine：
     - 主进程 `PlaybackSessionCoordinator`（Session Token 凭证鉴权、单活跃会话、时效调度、无虚假历史防范）；
     - 渲染层 `WebPlayerAdapter`（标准 HTML5 播放适配器，代际隔离，requestVideoFrameCallback 首帧测量）；
  2. 视窗形态实现：
     - 9:16 竖屏模式（主窗口自由缩放，视频居中 contain 保持画幅）；
     - 宽屏剧场模式；
     - 独立置顶摸鱼小窗（`alwaysOnTop`，独立 BrowserWindow，Prepare/Commit/Ack/Rollback 双向接力协议）；
  3. 短剧专属交互：滚轮防抖切集、键盘全功能快捷键、触控板惯性位移过滤；
  4. 秒级断点续播历史记录与追剧收藏夹联动。
- **准出验收标准**：
  - [x] **[CI Verified]** 主窗口与置顶小窗实现完整的 Prepare ➔ Commit ➔ Ack / Rollback 握手协议，单发声屏障保障音画不重叠；
  - [x] **[CI Verified]** 快捷键响应灵敏，非文本输入状态下空格暂停、方向键调音量精确触发；
  - [x] **[CI Verified]** 遇到受保护媒体或频控错误时，界面展示明确的恢复状态与友好诊断面板，不发生死锁或白屏；
  - [ ] **[Device Verified]** 在真机环境下使用授权测试媒体完成长时连续播放、断点续播与音频独占实测。

---

### 阶段 4：跨平台打包与发行准备 (Packaging & Release) —— [Implemented / Device Pending]
- **核心任务**：
  1. 配置 `electron-builder`：
     - Windows: NSIS 安装包、免安装 Portable 绿色便携版（x64）；
     - macOS: DMG 安装包、Zip 免安装归档（Apple Silicon arm64 / Intel x64）；
  2. 配置 `asarUnpack` 并实机校验安装包解压后 `openhongguo.wasm` 能正确读取执行；
  3. 系统托盘（System Tray）集成与窗口生命周期动态感知；
  4. 编写全链路端到端构建脚本与 GitHub Actions Release 产物强校验。
- **准出验收标准**：
  - [x] **[Implemented]** electron-builder 打包配置与 release.yml 产物强校验完成；
  - [ ] **[Device Verified]** 构建产物在干净的 Windows 10/11 和 macOS 设备上双击即可直接启动运行；
  - [ ] **[Device Verified]** 安装包解包后能够直接加载独立的 Wasm 模块并完成离线业务运行；
  - [ ] **[Device Verified]** 遵循 Apache 2.0 规范，安装包内携带合规的 LICENSE 与 NOTICE 文件。

---

## 3. 性能与资源指标测量口径规范 (Performance Metrics)

| 指标 | 目标阈值 | 测量规范与样本口径 |
| :--- | :--- | :--- |
| **首帧渲染耗时 (P95)** | **< 1.0 秒** (预加载命中) | 从用户触发切集事件至播放器通过 `video.requestVideoFrameCallback()` 实际渲染出视频第一帧，统计 50 次切换样本。 |
| **UI 交互响应延迟** | **< 50 毫秒** | 快捷键按下或点击分集至 UI 选中状态变更。 |
| **内存占用 (Idle)** | **< 150 MB** | 应用主窗口静置无播放时，Electron 整体进程树（Main + Renderer + GPU）的私有物理工作集 (Private Working Set)。 |
| **内存占用 (Playing)** | **< 350 MB** | 连续播放 1080p 视频 15 分钟后，Electron 整体进程树内存。 |

| 指标 | 目标阈值 | 测量规范与样本口径 |
| :--- | :--- | :--- |
| **首帧渲染耗时 (P95)** | **< 1.0 秒** (预加载命中) | 从用户触发切集事件至播放器通过 `video.requestVideoFrameCallback()` 实际渲染出视频第一帧，统计 50 次切换样本。 |
| **UI 交互响应延迟** | **< 50 毫秒** | 快捷键按下或点击分集至 UI 选中状态变更。 |
| **内存占用 (Idle)** | **< 150 MB** | 应用主窗口静置无播放时，Electron 整体进程树（Main + Renderer + GPU）的私有物理工作集 (Private Working Set)。 |
| **内存占用 (Playing)** | **< 350 MB** | 连续播放 1080p 视频 15 分钟后，Electron 整体进程树内存。 |
