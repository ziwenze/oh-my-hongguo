# Oh-My-Hongguo (红果短剧桌面端)

[![Status](https://img.shields.io/badge/Status-Pre--Alpha%20(In%20Development)-orange.svg)](#)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-brightgreen.svg)](#)
[![Tech](https://img.shields.io/badge/Stack-Electron%20%7C%20React%20%7C%20TailwindCSS-61dafb.svg)](#)

> **Oh-My-Hongguo** 是一款面向桌面平台（Windows / macOS）的短剧交互客户端探索项目。旨在通过桌面化交互优化（竖屏自适应、独立置顶小窗、键盘快速切集与本地历史）提供更好的大屏与摸鱼观影体验。
>
> ⚠️ **当前阶段**：本项目处于 **Pre-Alpha 早期研发与可行性验证阶段**。架构遵循《PRD & Architecture v1.2》，内容浏览与桌面交互 MVP 正在推进中，媒体播放核心按阶段 0 决策门槛分流适配。

---

## 声明与合规边界 (Disclaimer & Compliance)

1. **学习研究属性**：本项目旨在进行个人技术学习、逆向协议分析与桌面交互工程探索。软件源码遵循 Apache License 2.0，但严禁将本项目用于对第三方平台进行大规模非法采集、商业倒卖或任何侵犯原版权方合法权益的行为。
2. **知识产权与授权边界**：
   - 本仓库的软件源代码遵循 **Apache License 2.0** 开放；
   - 本项目通过非官方逆向 SDK 访问第三方平台公开接口，**Apache 2.0 许可证仅覆盖本软件代码本身，并不授予、也不包含任何第三方短剧音视频内容的使用权、播放权或商业分发权**；
   - 短剧元数据、封面、音视频流的全部著作权归原平台及版权方所有；
   - 本项目不提供音视频文件存储或托管服务。
3. **接口可用性与依赖风险**：第三方接口随时可能改版或调整访问策略（如 2026 年底上游观察到的匿名设备播放频控），本项目无法保证所有内容和接口长期持续可用。使用者应自行承担一切法律责任及访问风险。

---

## 规划特性与交互方向 (Planned Features)

- 🖥️ **跨平台桌面体验**：基于 Electron + React 构建，支持 Windows 10/11 与 macOS（Apple Silicon & Intel）。
- 📱 **短剧专属交互**：
  - **竖屏沉浸优先**：界面采用短剧原生竖屏比例居中展示，主窗口支持自由缩放与自适应布局，杜绝强制锁死窗体；
  - **剧场浏览模式**：宽屏模式下左侧播放、右侧常驻选集抽屉与剧目详情；
  - **独立置顶小窗 (Always on Top)**：可调节透明度的独立置顶浮窗，支持快捷摸鱼观影。
- ⚡ **分阶段连播与预热探索 (实验性)**：针对短剧 1~2 分钟短周期的特点，探索下一集元数据预获取与流预加载，目标优化切集首帧耗时（设定明确的 P95 性能指标而非虚夸“0延迟”）。
- 🛡️ **自包含 Vendor 架构**：核心逆向协议与算法依赖固化在 `vendor/openhongguo`，构建不依赖外部 npm 实时网络拉取，并建立 upstream 关联支持自主按需同步。
- 🕒 **本地数据中心**：本地原子化存储观看历史、秒级断点续播以及追剧收藏夹。

---

## 系统架构概要 (v1.2)

```
React 19 + TypeScript (页面渲染 / 状态管理 / 键盘控制)
       │
Typed IPC / Preload Bridge (安全沙箱通信)
       ▼
Application Service (业务编排 / 异常管理 / 历史存储)
  ├── SDK Adapter (vendor/openhongguo 抽象封装)
  ├── Media Engine (可插拔播放引擎：普通流 / CENC 兼容流 / 外部内核)
  ├── Window Manager (主窗口 / 自由缩放 / 独立置顶小窗)
  └── Data Store (本地原子写入 JSON / 优雅降级)
```

---

## 致谢与上游开源协议

本项目衍生自并致谢开源社区成果：
- [openhongguo](https://github.com/beilunyang/openhongguo) (Apache License 2.0, Copyright 2026 beilunyang) — 提供了红果短剧协议解析及 Spade DRM 密钥计算算法。

---

## 许可证 (License)

本项目遵循 [Apache License 2.0](LICENSE) 开源协议。
详细版权归属参见 [NOTICE](NOTICE)。
