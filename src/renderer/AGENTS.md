# Renderer / React 模块开发指导

> 生效目录：`src/renderer/`；同时遵守根目录 `AGENTS.md`。

## 模块结构

- `App.tsx`：路由式页面组合、主播放器浮层和全局交互入口；避免演变为业务/媒体策略中心。
- `views/`：发现、榜单、收藏、设置、独立 PiP 页面。
- `components/`：搜索、分集抽屉、播放器、卡片等复用组件。
- `player/WebPlayerAdapter.ts`：唯一应直接管理 HTMLVideoElement 加载、事件、seek、volume、rate 与销毁的适配层。
- `store/`：Renderer UI 及业务状态；跨进程权威数据仍通过 `window.electronAPI` 获取。
- IPC 变更必须联动 `src/preload/index.ts`、`src/main/index.ts` 和 `src/shared/types.ts`。

## React 和媒体不变量

1. Renderer 不直接访问文件系统、Node API、上游 SDK 或 CENC 密钥；只使用经过 Preload 暴露的 API。
2. 拥有 WebPlayerAdapter 的初始化 Effect 应由真实挂载/卸载控制；**不要把 `volume`、`isPlaying`、渲染回调引用等不断变化的状态写入该 Effect 的依赖，导致音量拖动时销毁 video**。
3. 事件处理器需要新状态时采用稳定 ref/专门的状态同步 Effect；新回调必须在组件清理时解除订阅和定时器。
4. 每次切集/检索分配代际并检查每段异步 await 后是否仍有效；旧播放源与旧请求不得覆盖新选集。
5. `PlayerModal` 和 `PiPPlayerView` 不应自行声称拥有会话；所有状态/进度 IPC 都使用最新 Token。区分正常关闭、向 PiP 移交及回滚。
6. 保持用户操作可恢复：loading、空态、错误、媒体不支持、等待手势和限流分别提示；不吞掉错误并显示伪成功。
7. 拖动进度、切换清晰度、音量和倍速要保持已有位置和播放状态；`metadata` 未就绪时不要错误地将 seek 强行钳制到 0。
8. 所有键盘事件避免输入框冲突和重复注册；全屏、窗口置顶、PiP 是不同系统行为，不应混用。
9. 图片失败有占位，列表 key 用稳定 ID，搜索联想及游标分页防旧请求覆盖新结果；敏感链接不输出到日志。

## 常见改动路线

- **PiP 音量/拖拽导致中断**：优先检查 `PiPPlayerView` 的 Effect 依赖、adapter `destroy()`、volume ref、事件订阅及真实播放测试。
- **切集后旧画面/自动下一集错误**：核对 `PlayerModal` 的 generation、最新回调 ref 和 `WebPlayerAdapter.load()`。
- **恢复进度错误**：跨查主进程 Coordinator、进度 IPC、loadedmetadata/duration 与 PlayerAdapter.seek。
- **浏览或搜索**：先确认 Adapter DTO 和 cursor 语义，再修正 View、store 和 loading/empty/error。

## 测试与体验验收

- 至少运行 `npm run typecheck && npm test && npm run build`。
- 播放、窗口、Preload、分集或关键交互改动追加 `npm run test:smoke`；打包路径变化追加 `npm run test:packaged`。
- 对易回归的播放器操作做实际媒体测试：播放时改音量、连续切集、快进、清晰度切换、开关 PiP、退出/返回、进入/退出全屏。
- 不把 DOM `playing` 事件、requestVideoFrameCallback 首帧和听到实际声音视为同一件事。
