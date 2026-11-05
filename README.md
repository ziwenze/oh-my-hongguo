# Oh-My-Hongguo (红果短剧桌面端)

<div align="center">

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-brightgreen.svg)
![Version](https://img.shields.io/badge/Release-v0.1.0-orange.svg)
![Electron](https://img.shields.io/badge/Electron-45.2.1-47848F.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)

**一款简洁、清爽、无广告的高清短剧桌面客户端。**  
支持 1080p 超清原生画质、独立置顶摸鱼小窗 (PiP) 无缝接力、秒级断点续播与原生硬件加速实时解密。

[📥 前往 Releases 下载安装包](#-下载与安装) • [✨ 核心功能特性](#-核心功能特性) • [⌨️ 快捷键指南](#️-快捷键指南) • [❓ 常见问题与解答](#-常见问题与故障排查)

</div>

---

## ✨ 核心功能特性

- 📺 **原生 1080p 超清画质**：播放器默认优先加载 1080p 最高清画质流，画面细腻，色彩饱满，在大屏显示器上告别手机小屏的模糊颗粒感。
- ⚡ **原生 CENC 硬件加速实时解密**：
  - 基于 Node.js 原生底层 C++ `crypto` 模块直接调用 CPU 的 **AES-NI 硬件级指令集**，全流解密耗时仅 10~40 毫秒；
  - 搭载高性能本地回环流代理，原生支持 HTTP 206 `Range: bytes` 分片切片，视频进度条**随意拖拽、快进快退微秒级响应**；
  - 自动注入 Chromium 硬件解码引擎，Windows 与 macOS 均实现 GPU 硬解 60fps 流畅播放。
- 🪟 **独立置顶摸鱼小窗 (PiP) 无缝接力**：
  - 专为桌面办公设计，点击小窗按钮即刻分化出独立的无边框桌面置顶浮窗（`alwaysOnTop`）；
  - 严格的 **单发声屏障**（Prepare ➔ Commit ➔ Ack 握手协议）：小窗开播瞬间主窗口立即暂停，**绝无双窗口同时重叠发声**；
  - 小窗关闭时，播放进度原子化交还主窗口，无缝在原断点继续播放。
- 📱 **短剧专属沉浸视窗**：
  - 默认铺满当前应用窗口全部空间，短剧原生 9:16 竖屏自适应居中，左右黑边自然留白；
  - 支持双击视频画面、点击全屏按钮或按 `F` 键一键进入**真正的操作系统级物理全屏**。
- 🔊 **可视化音量与进度交互**：
  - 配备平滑的音量拖拽滑块与实时数字百分比指示，支持键盘 `↑` / `↓` 方向键微调；
  - 独立小窗内置快退 5 秒、快进 5 秒、进度拖动条与醒目的中央播放控制。
- 🔍 **智能搜索与全网风云榜单**：
  - 多频道发现（精选推荐、真人剧场、动态漫剧、经典专区）；
  - 输入实时联想与时序防竞态，精准检索剧名、主角与题材；
  - 实时榜单（热播总榜、真人剧榜、动态漫榜、AI短剧榜、合集多季）。
- 💾 **本地原子化数据中心**：
  - 观看历史与秒级断点自动续播，退出时可靠落盘，跨进程重启数据完整保留；
  - 一键追剧收藏夹，本地轻量存储，不产生隐私泄露。
- 🛡️ **纯净开源与沙箱隔离**：
  - 基于 ContextBridge 白名单隔离机制，绝无远程恶意脚本注入，完全去除广告与付费弹窗。

---

## 📥 下载与安装

请前往 [GitHub Releases 最新版本发布页](https://github.com/ziwenze/oh-my-hongguo/releases) 下载适合你电脑系统的安装包：

### Windows 系统 (Windows 10 / 11 x64)

| 版本类型 | 下载文件名 | 说明与建议 |
| :--- | :--- | :--- |
| **🟢 绿色免安装便携版** | `Oh-My-Hongguo Portable 0.1.0.exe` | **推荐日常使用**。双击即可直接运行，不写注册表，放 U 盘也能随身带走，不留任何系统痕迹。 |
| **📦 完整安装包** | `Oh-My-Hongguo Setup 0.1.0.exe` | 标准 Windows 安装向导，自动在桌面和开始菜单创建启动图标，支持在控制面板中卸载。 |

### macOS 系统 (Apple Silicon M 系列 & Intel x64)

| 版本类型 | 下载文件名 | 说明与建议 |
| :--- | :--- | :--- |
| **💿 DMG 镜像安装包** | `Oh-My-Hongguo-0.1.0.dmg` | **推荐**。双击打开 DMG 镜像，将应用图标拖入 `Applications`（应用程序）即可完成安装。 |
| **🗜️ 免安装归档压缩包** | `Oh-My-Hongguo-0.1.0-mac.zip` | 解压后即可直接获取 `Oh-My-Hongguo.app`，适合喜欢绿色免安装的用户。 |

---

## ❓ 常见问题与故障排查

### Q1：macOS 首次打开提示“已损坏，无法打开。你应该将它移到废纸篓”？
**解答**：这是现代 macOS（macOS 13/14/15）对互联网下载的开源未公证软件的标准 Gatekeeper 拦截机制，**文件本身 100% 完好无损**。  
**一秒解决办法**：  
打开 Mac 自带的 **终端 (Terminal)**，复制执行以下命令并按回车（输入开机密码即可）：
```bash
sudo xattr -rd com.apple.quarantine /Applications/Oh-My-Hongguo.app
```
*(如果是直接解压在“下载”目录，执行：`xattr -cr ~/Downloads/Oh-My-Hongguo.app`)*。执行后再次双击即可正常打开！

### Q2：Windows 首次启动提示 SmartScreen 拦截？
**解答**：未购买昂贵企业代码签名证书的个人开源软件首次在 Windows 启动时会弹出 Windows Defender SmartScreen 提示。  
点击提示框上的 **“更多信息” (More info)** ➔ 点击右下角的 **“仍要运行” (Run anyway)** 即可。

### Q3：为什么有些分集偶尔提示“平台访问频控受限 (ANONYMOUS_LIMITED)”？
**解答**：短剧服务端针对单个匿名设备 IP 存在请求频控机制。客户端内置了单次凭据自动自愈刷新机制。如果连续高频点击切集遇到该提示，稍候 3~5 秒点击“重新探测”即可继续播放。

---

## ⌨️ 快捷键指南

播放器界面支持完备的键盘快捷键操作：

| 快捷键 | 功能操作 |
| :--- | :--- |
| **`Space` (空格)** | 播放 / 暂停 |
| **`↑` / `↓` 方向键** | 增加 / 减小音量 (每次微调 5%，带当前百分比反馈) |
| **`←` / `→` 方向键** | 快退 5 秒 / 快进 5 秒 |
| **`[` / `]` 方括号** | 切至上一集 / 切至下一集 |
| **`F` 键 / 双击画面** | 进入 / 退出系统物理全屏 |
| **`M` 键** | 快速静音 / 取消静音 |
| **`P` 键** | 主窗口全局置顶切换 (摸鱼必备) |
| **`Esc` 键** | 退出全屏 / 关闭当前播放器 |

---

## 🛠️ 本地编译与开发

如果你想在本地开发或自行编译打包：

```bash
# 1. 克隆本仓库
git clone https://github.com/ziwenze/oh-my-hongguo.git
cd oh-my-hongguo

# 2. 安装依赖
npm ci

# 3. 启动开发模式
npm run dev

# 4. 运行全套离线单测与 E2E 冒烟测试
npm run typecheck
npm test
npm run test:smoke

# 5. 打包生产分发应用
npm run dist:dir   # 打包免安装可执行程序目录
npm run dist       # 构建 DMG / ZIP / NSIS Setup / Portable 安装包
```

---

## 📄 开源许可与致谢

- 本项目软件源码遵循 [Apache License 2.0](LICENSE) 开源协议。
- 底层逆向协议与算法依赖致谢开源项目 [openhongguo](https://github.com/beilunyang/openhongguo) (Copyright 2026 beilunyang, Apache 2.0 License)。详细版权归属参见 [NOTICE](NOTICE)。
- **免责声明**：本软件仅供个人技术学习、协议研究与桌面交互体验探索使用，严禁用于商业牟利或盗录侵权。短剧音视频流及相关海报内容著作权归原平台及版权方所有。
