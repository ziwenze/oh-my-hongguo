import React, { useEffect, useState } from 'react';
import {
  Info,
  Shield,
  HardDrive,
  Cpu,
  CheckCircle2,
  Star,
  ExternalLink,
  Download,
  Heart,
  Sparkles,
  Keyboard,
  MessageSquare,
} from 'lucide-react';
import type { SystemDiagnostics } from '../../shared/types.js';

export const SettingsView: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getDiagnostics()
      .then((d) => {
        setDiagnostics(d);
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const openUrl = (url: string) => {
    window.electronAPI.openExternal(url).catch(() => {
      window.open(url, '_blank');
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 select-none pb-12">
      {/* 顶部标题 */}
      <div className="flex items-center space-x-2 pb-1 border-b border-border/50">
        <Info className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-gray-200">关于与系统设置</h2>
      </div>

      {/* 1. 产品核心介绍卡片 */}
      <div className="relative p-5 bg-gradient-to-br from-card via-card to-surface border border-border/80 rounded-2xl shadow-lg overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Sparkles className="w-32 h-32 text-primary" />
        </div>

        <div className="flex items-start space-x-3.5 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black text-xl shadow-inner flex-shrink-0">
            红
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-gray-100">Oh-My-Hongguo · 红果短剧桌面端</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/20 text-primary border border-primary/30">
                v0.1.0 正式版
              </span>
            </div>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              简洁、清爽、无广告的高清短剧桌面客户端。支持 1080p 超清原生画质、独立置顶摸鱼小窗 (PiP) 无缝接力、秒级断点续播与硬件加速解密。
            </p>
          </div>
        </div>

        {/* 社区互动与 Star 指导专区 */}
        <div className="mt-4 pt-3.5 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            onClick={() => openUrl('https://github.com/ziwenze/oh-my-hongguo')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-sm"
          >
            <Star className="w-3.5 h-3.5 fill-amber-300" />
            <span>点个 Star 支持一下</span>
          </button>

          <button
            onClick={() => openUrl('https://github.com/ziwenze/oh-my-hongguo/releases')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>检查新版与更新</span>
          </button>

          <button
            onClick={() => openUrl('https://github.com/ziwenze/oh-my-hongguo/issues')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-gray-300 hover:text-white text-xs font-medium transition-all hover:scale-[1.02] active:scale-95"
          >
            <MessageSquare className="w-3.5 h-3.5 text-muted" />
            <span>问题反馈与需求</span>
          </button>
        </div>

        <div className="mt-2.5 text-[11px] text-muted flex items-center justify-center space-x-1.5 text-center">
          <Heart className="w-3 h-3 text-red-400 fill-red-400 inline" />
          <span>开源项目持续维护不易，欢迎前往 GitHub 点亮 Star 给予开发者动力！关注 Release 发布页可第一时间接收更新推送。</span>
        </div>
      </div>

      {/* 2. 快捷键指南卡片 */}
      <div className="p-4 bg-card border border-border rounded-xl space-y-2.5 text-xs">
        <div className="font-semibold text-gray-200 flex items-center border-b border-border/50 pb-2">
          <Keyboard className="w-3.5 h-3.5 mr-1.5 text-primary" />
          桌面端快捷键操作指南
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">播放 / 暂停</span>
            <kbd className="font-mono text-gray-200 font-bold">Space 空格</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">音量微调 (5%)</span>
            <kbd className="font-mono text-gray-200 font-bold">↑ / ↓ 方向键</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">快退 / 快进 5 秒</span>
            <kbd className="font-mono text-gray-200 font-bold">← / → 方向键</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">上一集 / 下一集</span>
            <kbd className="font-mono text-gray-200 font-bold">[ / ] 方括号</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">静音 / 取消静音</span>
            <kbd className="font-mono text-gray-200 font-bold">M 键</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">系统全屏切换</span>
            <kbd className="font-mono text-gray-200 font-bold">F 键 / 双击画面</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">主窗口全局置顶</span>
            <kbd className="font-mono text-gray-200 font-bold">P 键</kbd>
          </div>
          <div className="p-2 bg-surface rounded-lg border border-border/40">
            <span className="text-muted block text-[10px]">退出全屏 / 关闭</span>
            <kbd className="font-mono text-gray-200 font-bold">Esc 键</kbd>
          </div>
        </div>
      </div>

      {/* 3. 系统运行环境诊断卡片 */}
      <div className="p-4 bg-card border border-border rounded-xl space-y-2.5 text-xs">
        <div className="font-semibold text-gray-200 flex items-center justify-between border-b border-border/50 pb-2">
          <span className="flex items-center">
            <Cpu className="w-3.5 h-3.5 mr-1.5 text-accent" />
            运行时基线与环境
          </span>
          <span className="text-[10px] text-green-400 flex items-center font-normal">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            硬件加速与 CENC 解密就绪
          </span>
        </div>

        {isLoading ? (
          <div className="py-4 text-center text-xs text-muted">加载诊断信息中...</div>
        ) : diagnostics ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted text-[11px]">
              <div>
                <span>应用版本:</span> <strong className="text-gray-200 ml-1">{diagnostics.appVersion}</strong>
              </div>
              <div>
                <span>系统平台:</span> <strong className="text-gray-200 ml-1">{diagnostics.platform}</strong>
              </div>
              <div>
                <span>Electron:</span> <strong className="text-gray-200 ml-1">{diagnostics.electronVersion}</strong>
              </div>
              <div>
                <span>Node.js:</span> <strong className="text-gray-200 ml-1">{diagnostics.nodeVersion}</strong>
              </div>
            </div>

            <div className="pt-1.5 border-t border-border/40 text-[11px] text-muted break-all">
              <span className="flex items-center mb-1">
                <HardDrive className="w-3 h-3 mr-1 text-muted" />
                匿名设备数据路径:
              </span>
              <code className="bg-surface px-2 py-1 rounded text-gray-300 block font-mono text-[10px] select-all">
                {diagnostics.profilePath}
              </code>
            </div>
          </>
        ) : (
          <div className="py-2 text-xs text-muted">未能获取系统诊断信息</div>
        )}
      </div>

      {/* 4. 开源合规与免责声明卡片 */}
      <div className="p-4 bg-card border border-border rounded-xl space-y-2 text-xs text-muted leading-relaxed">
        <div className="font-semibold text-gray-200 flex items-center border-b border-border/50 pb-2">
          <Shield className="w-3.5 h-3.5 mr-1.5 text-primary" />
          开源许可与免责声明
        </div>
        <p className="text-[11px]">
          本项目遵循 <strong>Apache License 2.0</strong> 开源协议，逆向协议底座致谢并派生自开源项目{' '}
          <button
            onClick={() => openUrl('https://github.com/beilunyang/openhongguo')}
            className="text-primary hover:underline inline-flex items-center"
          >
            openhongguo
            <ExternalLink className="w-2.5 h-2.5 ml-0.5 inline" />
          </button>
          。
        </p>
        <p className="text-[11px]">
          本软件仅供个人技术学习、协议分析与桌面交互工程探索使用，严禁用于任何商业牟利目的。短剧音视频流及相关海报内容著作权归原平台及版权方所有。
        </p>
      </div>
    </div>
  );
};
