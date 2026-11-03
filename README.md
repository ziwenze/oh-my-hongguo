# Oh-My-Hongguo (红果短剧桌面端)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-brightgreen.svg)](#)
[![Tech](https://img.shields.io/badge/Stack-Electron%20%7C%20React%20%7C%20TailwindCSS-61dafb.svg)](#)

> **Oh-My-Hongguo** 是一款专为桌面平台（Windows / macOS）打造的短剧沉浸式播放客户端。基于开放技术探索构建，具备短剧专属的沉浸式刷剧交互、智能 0 延迟自动连播、多比例窗口自适应与置顶小窗摸鱼模式。

---

## 声明与免责条约 (Disclaimer)

1. **项目性质**：本项目仅供技术学习、逆向协议研究及个人交流使用，严格禁止用于任何商业营利活动。
2. **版权声明**：本项目内检索并呈现的短剧元数据、图片、视频流等所有数字资产的知识产权均归原版权所有方（北京有书看书等关联平台）所有。本项目不存储、不上载任何音视频文件。
3. **法律责任**：使用本项目即表示您完全知悉并同意本免责声明。任何人或组织因使用本项目产生的任何直接或间接法律责任均由使用者自行承担，开发者概不负责。

---

## 核心特性

- 🖥️ **跨平台原生桌面体验**：原生支持 Windows 10/11 与 macOS（Apple Silicon / Intel）。
- 📱 **短剧专属交互**：
  - **沉浸式刷剧模式**：支持鼠标滚轮、键盘上下键全屏切剧，还原如同手机端短视频般流畅的切流体验。
  - **多视窗自适应**：一键切换 9:16（竖屏短剧最佳画幅）、16:9（横屏短剧）或自定尺寸。
  - **置顶摸鱼小窗 (Always on Top)**：在屏幕角落静音/小屏播放，打工人看剧神器。
- ⚡ **无感连播与 0 延迟预加载**：针对短剧 1~2 分钟一集的特点，后台自动在上一集末尾预加载下一集播放源与解密密钥，切集秒开无黑屏缓冲。
- 🔑 **透明流解密中转**：内置本地回环解密代理（Local Stream Proxy），在本地毫秒级解密 CENC (AES-CTR) 视频流，前端享受原生 MP4 拖拽与倍速能力。
- 🛡️ **自包含 Vendor 架构**：核心解密与逆向通信模块固化于本地源码，零外部被动依赖，不受第三方包下架影响；支持上游更新按需拉取。
- 🕒 **本地数据中心**：秒级断点续播历史记录、本地追剧收藏夹，数据完全掌握在自己电脑中。

---

## 技术架构

- **宿主环境**：Electron 34+
- **渲染前端**：React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Zustand
- **通信与解密内核**：本地 Vendor 固化的 `openhongguo` Wasm 模块（Apache-2.0）
- **本地代理**：Node.js 本地 HTTP Range 流中转解密服务（AES-CTR 流式解密）
- **数据持久化**：本地 JSON 存储（观看历史、追剧收藏、匿名设备档案）

---

## 致谢与上游开源协议

本项目依赖并衍生自开源项目：
- [openhongguo](https://github.com/beilunyang/openhongguo) (Apache License 2.0, Copyright 2026 beilunyang) — 提供了红果短剧匿名协议及 Spade DRM 密钥计算算法。

---

## 许可证 (License)

本项目遵循 [Apache License 2.0](LICENSE) 开源协议。
详细版权归属参见 [NOTICE](NOTICE)。
