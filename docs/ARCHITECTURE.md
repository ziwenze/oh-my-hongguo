# Oh-My-Hongguo 系统架构设计说明书 (Architecture v1.2)

| 版本 | 状态 | 作者 | 修订日期 | 评审基线 |
| :--- | :--- | :--- | :--- | :--- |
| **v1.2.0** | Architecture Approved | Oh-My-Hongguo Team | 2026-11-04 | 实施两层媒体引擎规范、跨窗口会话接力状态机、敏感数据隔离与 Electron 45 稳定版锁定 |

---

## 1. 总体分层架构 (Tiered Architecture)

系统遵循关注点分离原则，划分为 **UI 表现层**、**安全 IPC 隔离层**、**主进程业务编排层**、**核心适配引擎层** 四大层级：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        React 19 + TypeScript (UI 表现层)                │
│  - 状态编排 (Zustand: usePlayerStore, useEpisodeStore, useHistoryStore)  │
│  - 响应式视窗布局：竖屏 9:16 (contain) / 宽屏剧场 / 独立置顶摸鱼小窗      │
│  - 渲染端播放适配器 (WebPlayerAdapter): HTML5 / Shaka / 媒体内核封装    │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │ ContextBridge (Typed IPC 强类型通道)
┌────────────────────────────────────▼────────────────────────────────────┐
│                    Application Service (主进程业务编排层)               │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 播放会话协调器 (PlaybackSessionCoordinator)                       │  │
│  │ - 维护全局单一活跃播放会话 (Single Active Session)                 │  │
│  │ - 调度主窗口与置顶小窗的暂停-位移-接力状态机                      │  │
│  │ - 负责 expires_at 资源时效校验与静默刷新                          │  │
│  │ - 敏感密钥材料受控管理，绝不经通用 IPC 向渲染层广播原始 Hex 密钥  │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │                                    │
│  ┌─────────────────────────┐       │       ┌─────────────────────────┐  │
│  │ 错误与频控降级中心      │       │       │ 窗口管理器              │  │
│  │ - 遵守平台访问约束      │       │       │ (Window Manager)        │  │
│  │ - 明确状态提示 (不换号) │       │       │ - 主窗自由缩放 (contain)│  │
│  └─────────────────────────┘       │       │ - 独立小窗记忆与置顶    │  │
│                                    │       └─────────────────────────┘  │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────────────────────┐ ┌─────────────────────────────────┐
│       SDK Adapter 抽象封装          │ │     本地原子持久化中心          │
│   (对接 vendor/openhongguo)         │ │         (Data Store)            │
│  - Wasm 运行时生命周期隔离          │ │  - 原子写入 (tmp + rename)      │
│  - 匿名设备 Profile 状态维护        │ │  - 500ms 防抖节流写入           │
│  - 发现 / 搜索 / 榜单 / 分集解析    │ │  - 崩溃备份恢复机制 (.bak)      │
│  - 平台约束识别 (ANONYMOUS_LIMITED) │ │  - before-quit 强制落盘刷新     │
└─────────────────────────────────────┘ └─────────────────────────────────┘
```

---

## 2. 核心架构：两层 Media Engine 与敏感数据隔离

媒体播放采用两层解耦结构，明确主进程与渲染进程的职责边界与安全隔离：

```
[渲染进程]  WebPlayerAdapter (接口: IWebPlayerAdapter)
               ▲
               │ IPC 会话指令 (play, pause, seek, loadSource)
               ▼
[主进程]    PlaybackSessionCoordinator (会话状态机、时效校验、受控流选路)
               │
               ├── 策略 A: 无保护直接流 (Direct Stream URL)
               ├── 策略 B: EME ClearKey 适配流 (KID + InitData) [受控分发]
               └── 策略 C: 经授权的外部解封装/硬解通道
```

### 2.1 主进程层：`PlaybackSessionCoordinator`
- **单例会话原则**：整机进程生命周期内只允许存在一个活跃播放会话（Active Playback Session），主窗口与置顶小窗共享此会话；
- **媒体选路与敏感数据隔离 (Security Boundary)**：
  - 读取 SDK `PlaybackResult`，如果 `protected: false`，直接将原 CDN 直链分发给渲染层进行原生播放；
  - 如果 `protected: true`，**绝不通过通用全局 IPC 向普通业务渲染组件广播原始 AES 内容密钥**。仅在获得正规授权且渲染层运行受控的 ClearKey 专用 EME 会话模块时，在限定边界内传入必要参数；同时明确：由于 W3C ClearKey 机制特性，客户端仍需经手密钥，技术隔离不能等同于不可被应用进程观察，一切受保护流播放均必须建立在获得合法内容授权的前提下；
- **时效感知调度**：
  - 检查流模型的 `expires_at`（Unix 秒数整数），若 `Date.now()/1000 >= expires_at - 60`（提前 1 分钟临期），自动在后台异步请求刷新播放源。

### 2.2 渲染进程层：`WebPlayerAdapter`
定义通用的前端播放适配接口，使 UI 组件与底层播放技术彻底解耦：
```typescript
export interface IWebPlayerAdapter {
  attach(videoElement: HTMLVideoElement): Promise<void>;
  load(source: PlaybackMediaSource): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}
```

---

## 3. 跨窗口播放接力状态机 (Cross-Window Handoff State Machine)

主窗口与独立置顶小窗作为两个独立的 `BrowserWindow`，**在物理上无法共享同一个 DOM `<video>` 元素**。系统通过主进程的会话状态机实现进度连续接力：

```
[主窗口播放中]
     │ 用户按下 'P' 或点击置顶小窗按钮
     ▼
1. 主窗口播放器捕获当前精确进度 (currentTime)，调用 pause() 停止播放，确保单一窗口发声
     │
2. 主窗口向主进程发送 IPC: `playback:handoff-to-pip` { position, seriesId, episodeId }
     │
3. 主进程 PlaybackSessionCoordinator 更新会话状态，唤起/聚焦置顶小窗
     │
4. 置顶小窗收到 IPC: `playback:receive-handoff`，初始化播放器并 Seek 到指定 position
     │
5. 置顶小窗恢复播放；主窗口 UI 切换为“正在小窗播放中”占位态
```
反向从小窗切回主窗口时执行对称时序，保障播放进度连续，任何时刻仅有一个窗口发声，接力耗时满足可测量性能指标。

---

## 4. 本地持久化与数据模型规范 (Data Store & Schema)

### 4.1 数据时效格式严格区分
严禁将不同时间字段混淆为同一类型解析：
- **`cover_expires_at`**：服务端返回格式为 **RFC 3339 字符串**（ISO 8601，如 `"2026-11-04T15:00:00Z"`），解析使用 `Date.parse(str)`；
- **`expires_at`**：服务端返回格式为 **Unix 时间戳整数**（单位：秒，如 `1793779200`），解析使用 `ts * 1000`。

### 4.2 观看历史数据结构 (Watch History Schema)
优先持久化稳定的业务标识与数值，可失效的 CDN 封面放入运行时易失缓存：
```typescript
export interface WatchHistoryItem {
  seriesId: string;
  seriesTitle: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  positionSeconds: number; // 精确到浮点秒 (例如 75.4)
  durationSeconds: number; // 视频总秒数 (例如 124.0)
  progressPercentage: number; // 进度百分比 (例如 60.8)
  updatedAt: number; // 毫秒时间戳 Date.now()
  // 封面 URL 仅作为临时缓存，过期后按 seriesId 重新换取
  cachedCoverUrl?: string;
  cachedCoverExpiresAt?: string; // RFC 3339 字符串
}
```

### 4.3 原子化安全存储机制 (Safe Atomic Write)
为降低系统掉电或应用崩溃导致的数据丢失风险，存储模块执行以下保障：
1. **写入流程**：新数据先序列化写入临时文件 `history.json.tmp` -> 校验格式通过后执行系统级原子重命名 `rename` 覆盖目标文件 `history.json`；
2. **灾备恢复机制**：每次成功写入时同步保留一份 `history.json.bak`；若启动时读取主文件发生 JSON 解析异常，自动从备份文件 `.bak` 降级恢复；若均失败，记录诊断日志并重置为空状态，避免应用启动白屏死锁；
3. **节流与优雅退出**：高频进度更新通过内存缓存并应用 500ms 节流；监听 Electron 的 `app.on('before-quit')` 事件，在进程退出前执行同步刷盘。

---

## 5. 安全体系与 Electron 规范 (Security & Sandboxing)

遵循 Electron 官方安全清单（Security Checklist）：
1. **沙箱与上下文隔离**：
   - 全量开启 `contextIsolation: true`；
   - 全量开启 `sandbox: true`；
   - 彻底禁用 `nodeIntegration: false`；
2. **严格的 Content Security Policy (CSP)**：
   - 限制脚本仅能从打包目录加载，严禁 `unsafe-eval`（Wasm 仅允许本地内嵌实例）；
   - 限制 `media-src` 仅允许经过验证的官方 CDN 域名及本地受控回环；
3. **外部导航与链接拦截**：
   - 监听 `will-navigate` 和 `new-window` 事件，拦截所有未经批准的窗口重定向；
   - 外部超链接强制通过系统默认浏览器（`shell.openExternal`）安全打开；
4. **日志脱敏防泄漏**：
   - 主进程与渲染进程的调试日志在输出前严格脱敏（过滤设备 ID、Gorgon/Helios 签名参数与解密密钥材料）。

---

## 6. 技术栈基线与版本锁定 (Engineering Baseline)

| 维度 | 规范选型 | 版本基线与要求 |
| :--- | :--- | :--- |
| **桌面运行时** | **Electron** | **45.x (当前受支持稳定主版本)**，搭载 Node.js 24+，Chromium 最新稳定版，严格通过 `package-lock.json` 锁定补丁版本 |
| **前端视图框架** | **React** | **19.x** + TypeScript 5.7+ |
| **构建打包引擎** | **Vite** | **6.x** + `@vitejs/plugin-react` |
| **样式与原子设计** | **Tailwind CSS** | **v3.4+ / v4** + Lucide React 图标库 |
| **状态管理** | **Zustand** | **v5.x** (原子化、无样板代码) |
| **底层 SDK** | **vendor/openhongguo** | 本地固化 0.1.0 Wasm 模块 (6.5MB) |
| **打包分发** | **electron-builder** | 配置 `asarUnpack` 并经最终安装包实际运行校验 |
