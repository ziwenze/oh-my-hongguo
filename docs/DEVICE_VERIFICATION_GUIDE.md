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

## 二、macOS “已损坏，移到废纸篓” 问题与安全放行指南

> **为什么会提示“已损坏，无法打开。你应该将它移到废纸篓”？**  
> 1. **系统隔离属性 (`com.apple.quarantine`)**：macOS 对所有通过浏览器（Safari/Chrome/Edge 等）从互联网下载的文件，都会自动加上隔离属性；  
> 2. **苹果公证机制 (Notarization)**：在现代 macOS（macOS 13 Ventura、macOS 14 Sonoma、macOS 15 Sequoia）上，若下载的应用尚未接入苹果付费开发者证书（Apple Developer ID，$99/年）与官方公证，Gatekeeper 安全机制**不再弹出“未识别的开发者”，而是直接拦截并提示“已损坏，移到废纸篓”**。  
> **这绝非文件真正损坏或打包丢失**，而是 macOS 针对未公证网络下载软件的标准拦截策略。

---

### 1. macOS 一键解决命令 (终端执行)

将应用放入 `/Applications`（应用程序目录）后，打开 Mac 自带的 **终端 (Terminal)**，复制并执行以下命令：

```bash
sudo xattr -rd com.apple.quarantine /Applications/Oh-My-Hongguo.app
```
*(输入 Mac 开机密码并回车即可，终端输入密码时不会显示字符)*

**如果应用直接解压在“下载”目录 (`Downloads`)**，可执行：
```bash
xattr -cr ~/Downloads/Oh-My-Hongguo.app
```

**若仍被系统策略拦截，执行综合修复（清除隔离 + 本地补全自签）**：
```bash
sudo xattr -cr /Applications/Oh-My-Hongguo.app && sudo codesign --force --deep -s - /Applications/Oh-My-Hongguo.app
```

执行后，再次双击 `Oh-My-Hongguo` 即可秒开运行！

---

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
