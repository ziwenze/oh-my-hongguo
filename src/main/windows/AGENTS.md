# Windows / PiP 模块开发指导

> 生效目录：`src/main/windows/`；同时遵守根目录 `AGENTS.md`。

## 职责与协作文件

- `manager.ts` 创建/销毁主窗口与独立 PiP BrowserWindow，协调窗口所有权和接力事务。
- `../session/coordinator.ts` 持有权威的播放 Session Token；窗口管理器不得自行伪造 Token。
- `../index.ts` 提供 IPC 调度与 sender 校验；`src/preload/index.ts` 暴露受控事件订阅。
- `src/renderer/components/PlayerModal.tsx` 与 `src/renderer/views/PiPPlayerView.tsx` 执行实际视频暂停、播放与位置更新。

## 不变量：窗口和事务

1. 主窗口与 PiP 是不同 BrowserWindow / video 元素；**所有权转移**和**物理媒体停止/开始**必须分别得到可靠证据。
2. 接力路径：源窗口暂停并确认位置 → 目标窗口渲染就绪 → Coordinator 转移所有权并签发新 Token → 目标开始播放或明确进入等待用户手势状态 → 事务完成或回滚。
3. 任一阶段超时、目标窗口被销毁、媒体失败都要解除等待中的 Promise，不可将超时默认为“成功”。
4. 严格校验 Ack 的调用窗口 ID 和当前 Token；PiP 的 `ackTargetPlaying` 不是单凭存在窗口就能宣告成功。
5. 回滚和 `closed` 监听可能同时触发；恢复所有权、通知主窗口和更新 Token 必须幂等，不能重复递增 generation。
6. 重复点击开启 PiP 共享同一笔 pending 事务，不因窗口刚创建就提前返回完成。
7. 主窗临时暂停与用户主动关闭会话是不同操作；不要在 Prepare 阶段卸载源播放器并误关 Session。保留或释放组件的行为必须与真实恢复方案一致。
8. 每次窗口创建保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`；限定可信 origin，限制导航/新窗口、外部链接与权限。
9. 关闭主窗口、退出应用、强行销毁 PiP 时应有可预期行为；不留下孤儿 Session、未清理定时器或悬挂 promise。

## 修改指导

- **小窗无法打开**：检查 preload 文件、dev/prod URL、加载失败、Ready Ack 注册顺序及 source-pause timeout。
- **切回主窗口失败**：检查关闭处理注册时间、源 PiP ID、幂等 `restoreOwnershipToMainWindow()`、最新位置与 Renderer 订阅。
- **音频重叠**：不要只依赖状态字段；检查源 DOM 视频的 pause Ack，再允许目标实际播放。
- **快速切集/重复打开**：交叉核对 `openPiPPromise`、Token generation、源/目标窗口生命期及旧媒体的异步回调。

## 相关验证

- `tests/playbackCoordinator.test.mjs`：Token、合法转移和跨窗口操作拒绝。
- `tests/electronSmoke.mjs`：真实双 BrowserWindow 与本地媒体生命周期。
- `tests/packagedRuntimeSmoke.mjs`：打包程序中的 PiP 接力和重启。
- UI 修改还需在授权测试媒体上验证：主窗播放 → 小窗接管 → 调节音量、暂停、seek → 关闭小窗恢复；包括失败/超时和重复点击路径。
- 不将绿色 CI 的窗口创建测试冒充真机音频独占验证。
