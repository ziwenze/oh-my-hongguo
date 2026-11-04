# Oh-My-Hongguo 干净设备物理真机验收指南 (Phase 4.3)

> **目标版本**：0.1.0-alpha  
> **适用范围**：macOS (Apple Silicon arm64 / Intel x64)、Windows (10 / 11 x64) 纯净物理设备  
> **当前状态**：Phase 4.1 与 Phase 4.2 已获 CI 自动化验证通过；本指南指导开展 **Phase 4.3 物理设备手动验收**。

---

## 一、安装包获取与校验 (Artifacts & Checksums)

由于当前尚未进入 Phase 4.4（公证与正式 GitHub Releases），测试安装包统一从 GitHub Actions Package Validation 构建流水线下载：

1. **下载地址**：[GitHub Actions Package Validation · Run #41903262612](https://github.com/ziwenze/oh-my-hongguo/actions/runs/41903262612)
2. **下载产物**：
   - macOS 测试包：`package-macos-latest.zip`（内含 `.dmg`、`.zip` 与 `SHA256SUMS.txt`）
   - Windows 测试包：`package-windows-latest.zip`（内含 `Setup.exe`、`Portable.exe` 与 `SHA256SUMS.txt`）
3. **哈希完整性校验**：
   - **macOS**：
     ```bash
     shasum -a 256 -c SHA256SUMS.txt
     ```
   - **Windows (PowerShell)**：
     ```powershell
     Get-FileHash -Algorithm SHA256 "Oh-My-Hongguo Setup 0.1.0.exe"
     Get-FileHash -Algorithm SHA256 "Oh-My-Hongguo Portable 0.1.0.exe"
     ```

---

## 二、平台安全策略提示与放行说明 (Gatekeeper & SmartScreen)

> **注意**：Phase 4.3 产物尚未接入苹果公证（Notarization）与 Windows 代码签名证书（这是 Phase 4.4 的工作），系统会弹出安全拦截提示，属于预期内的正常表现。

### 1. macOS (Gatekeeper 拦截)
- **首次打开提示**：“无法打开‘Oh-My-Hongguo’，因为 Apple 无法检查其是否包含恶意软件”；
- **放行方法**：
  1. 打开“系统设置” ➔ “隐私与安全性” ➔ 滚动到底部；
  2. 在“已阻止使用‘Oh-My-Hongguo’”右侧，点击 **“仍要打开”**；
  3. 或在访达中右键单击应用图标，按住 `Control` 键点击 **“打开”**，在弹出警告框中点击 **“打开”**。

### 2. Windows 10/11 (SmartScreen 拦截)
- **首次启动提示**：“Windows 已保护你的电脑 (Microsoft Defender SmartScreen 阻止了无法识别的应用启动)”；
- **放行方法**：
  1. 点击提示框中的 **“更多信息” (More info)**；
  2. 点击右下角出现的 **“仍要运行” (Run anyway)** 按钮。

---

## 三、Phase 4.3 物理设备实测验收清单 (8 项测试矩阵)

| 编号 | 测试场景 | 验收操作指引 | 预期结果与通过标准 | 验证结果 |
| :--- | :--- | :--- | :--- | :--- |
| **01** | **安装与首次冷启动** | **macOS**：挂载 DMG 拖拽入 `/Applications` 或解压 ZIP 打开；<br>**Windows**：双击 `Setup.exe` 执行标准安装向导，或双击 `Portable.exe`。 | 应用顺利冷启动，无白屏、无动态库丢失错误，3 秒内呈现主界面。 | `[ ] 待测` |
| **02** | **底座与 Wasm 初始化** | 观察网络面板与控制台（或界面状态）。 | 独立解包的 `openhongguo.wasm` 在后台成功实例化，主界面正常加载推荐频道。 | `[ ] 待测` |
| **03** | **内容浏览与搜索交互** | 1. 切换精选、现代逆袭、战神等频道；<br>2. 搜索框输入剧目，查看联想下拉与防抖；<br>3. 浏览全网风云榜 Top 10；<br>4. 打开剧目详情与分集抽屉。 | 数据流畅呈现，无请求时序代际串台，分集支持游标分页平滑加载。 | `[ ] 待测` |
| **04** | **媒体播放与切集** | 1. 点击任意剧集进入播放；<br>2. 空格键暂停/播放，方向键快进/快退；<br>3. 滚轮/快捷键切集；<br>4. 切换清晰度 (1080p / 720p)。 | 视频首帧出帧迅速（< 1.0 秒），音画同步，分集切换无黑屏卡死。 | `[ ] 待测` |
| **05** | **独立置顶小窗 (PiP) 与音频独占实测** | 1. 正在播放视频时，点击播放器右下角 **“小窗模式”** 按钮；<br>2. 观察主窗口与独立小窗的表现；<br>3. 在小窗中拖动位置、暂停/播放、调节音量；<br>4. 点击小窗关闭按钮 `X`。 | **关键物理断言**：<br>① 接力瞬间主窗口立即暂停静音，**绝无双窗口重叠发声**；<br>② 小窗出帧开播并保持全局置顶；<br>③ 小窗关闭后，主窗口无缝在原断点恢复发声。 | `[ ] 待测` |
| **06** | **进程退出与跨进程断点续播** | 1. 观看一段短剧（如播放至 01:23）并收藏该剧；<br>2. 完全退出应用（macOS `Cmd+Q`，Windows 右键托盘退出）；<br>3. 重新冷启动应用，打开“历史”与“我的收藏”。 | 退出时触发 `flushSync` 落盘，重启后历史进度与收藏 100% 完整恢复。 | `[ ] 待测` |
| **07** | **系统托盘与快捷控制** | 1. 点击主窗口关闭/最小化按钮；<br>2. 双击或右键系统托盘图标；<br>3. 快捷键 `P` 触发全局置顶。 | 托盘菜单响应正常，主窗口可被重新唤醒，状态栏图标正常。 | `[ ] 待测` |
| **08** | **卸载与本地存储清理** | **macOS**：将应用移入废纸篓；<br>**Windows**：控制面板执行卸载向导。 | 卸载程序运行顺畅，注册表项与桌面快捷方式被干净清理。 | `[ ] 待测` |

---

## 四、已知限制与降级交互说明 (Platform Diagnostics)

1. **平台限制频率 (ANONYMOUS_LIMITED)**：
   - 逆向端点存在字节跳动官方匿名频控机制。遇到限流时，客户端会显示“平台访问限制”状态并停止自动重试，严禁静默频繁调用重置设备。
2. **受保护媒体准入机制 (DRM Protection)**：
   - 平台部分专有 `bytevc1` (H.265) 与 `cenc-aes-ctr` 受保护媒体流属于阶段 0“准入授权评估中”范畴。播放器检测到该标志时会友好提示“受保护媒体需待阶段 0 准入授权”，这是符合 PRD 安全边界的正常策略表现。
3. **开源许可合规**：
   - 产物内部携带完整的 `LICENSE` (Apache License 2.0) 与 `NOTICE` 说明文件，符合对 `beilunyang/openhongguo` 的知识产权与开源署名义务。
