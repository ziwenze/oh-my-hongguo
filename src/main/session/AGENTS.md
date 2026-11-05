# Session 模块开发指导

> 生效目录：`src/main/session/`；同时遵守根目录 `AGENTS.md`。

## 职责及入口

- `coordinator.ts` 是活跃播放会话和进度状态的主进程单一事实来源。
- `src/shared/types.ts` 定义跨进程 Session Token 和状态 DTO。
- `src/main/index.ts` 验证 IPC sender 与参数并委托 Coordinator。
- `src/main/windows/manager.ts` 控制窗口所有权转移；`src/main/store/dataStore.ts` 持久化历史。
- Renderer 的 `PlayerModal`、`PiPPlayerView` 只保有合法 Token 并上报媒体事件，不单独决定全局所有权。

## 不变量

1. 全局最多一个活跃 Session；每个会话具有 `sessionId`、`generation`、`ownerWindowId`。Token 不只是 UI 状态。
2. 更新状态、进度、结束会话前都要校验 Token 与真实 `event.sender.id`；旧分集、旧 generation 或非所有者的迟到消息必须拒绝。
3. `transferOwnership()` 签发新 generation 后，旧 Token 立即失效；不可通过绕过 Coordinator 直接改变所有权。
4. 只允许合法状态转换；不能为迎合竞态直接放宽状态机。先区分 `resolving` / `ready` / `playing` / `paused` / `ended` / `error`。
5. 历史续播位置不是“本次真实播放”。在真正收到播放证据前，不得伪造观看记录。
6. 新会话继承旧会话前，先保存旧会话已经发生的有效进度；不得让被淘汰请求重写新会话历史。
7. 正常退出时先提交合法会话最终状态，再关闭存储；不得在存储已 `closeSync()` 后尝试保存。

## 常见任务路线

- **切集串台**：同时检查 `startSession`、Renderer generation guard、IPC token 校验和迟到的 `playing/timeupdate/error` 事件。
- **断点不正确**：比较初始化 resume、实际 playing、进度上报节流和 DataStore 落盘，不靠调整保存间隔掩盖时序问题。
- **PiP 接力失败**：检查旧持有人暂停 Ack、新持有人 Token、状态转换及反向恢复；具体事务见 `../windows/AGENTS.md`。
- **会话关闭**：明确用户关闭、换集、窗口转移、应用退出四种不同原因，不把卸载组件直接等同于结束会话。

## 测试准出

- `tests/playbackCoordinator.test.mjs`：非法 Token/窗口、旧代际、非法状态、继承保存、所有权转换和重复关闭。
- 影响 Renderer 或 PiP 时运行 `npm run test:smoke`，必要时验证本地媒体出帧和打包应用重启。
- 测试必须覆盖迟到事件与失败分支；不可只验证调用后某一字段相等。
