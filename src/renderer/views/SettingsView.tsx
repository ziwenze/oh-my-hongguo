import React, { useEffect, useState } from 'react';
import { Info, Shield, HardDrive, Cpu, CheckCircle2 } from 'lucide-react';
import type { SystemDiagnostics } from '../../shared/types.js';

export const SettingsView: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getDiagnostics().then((d) => {
      setDiagnostics(d);
    }).catch(console.error).finally(() => {
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center space-x-2 pb-1">
        <Info className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-gray-200">系统诊断与关于</h2>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-muted">加载系统诊断中...</div>
      ) : diagnostics ? (
        <div className="space-y-3">
          {/* 环境信息卡片 */}
          <div className="p-3.5 bg-card border border-border rounded-xl space-y-2.5 text-xs">
            <div className="font-semibold text-gray-200 flex items-center justify-between border-b border-border/50 pb-2">
              <span className="flex items-center">
                <Cpu className="w-3.5 h-3.5 mr-1.5 text-accent" />
                运行时基线
              </span>
              <span className="text-[10px] text-green-400 flex items-center font-normal">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                健康运行中
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-muted">
              <div>
                <span>应用版本:</span> <strong className="text-gray-200">{diagnostics.appVersion}</strong>
              </div>
              <div>
                <span>系统架构:</span> <strong className="text-gray-200">{diagnostics.platform}</strong>
              </div>
              <div>
                <span>Electron:</span> <strong className="text-gray-200">{diagnostics.electronVersion}</strong>
              </div>
              <div>
                <span>Node.js:</span> <strong className="text-gray-200">{diagnostics.nodeVersion}</strong>
              </div>
            </div>

            <div className="pt-1 border-t border-border/40 text-[11px] text-muted break-all">
              <span className="flex items-center mb-1">
                <HardDrive className="w-3 h-3 mr-1 text-muted" />
                匿名设备数据路径:
              </span>
              <code className="bg-surface px-2 py-1 rounded text-gray-300 block font-mono text-[10px]">
                {diagnostics.profilePath}
              </code>
            </div>
          </div>

          {/* 开源合规与免责声明卡片 */}
          <div className="p-3.5 bg-card border border-border rounded-xl space-y-2 text-xs text-muted leading-relaxed">
            <div className="font-semibold text-gray-200 flex items-center border-b border-border/50 pb-2">
              <Shield className="w-3.5 h-3.5 mr-1.5 text-primary" />
              合规与免责声明
            </div>
            <p className="text-[11px]">
              本项目遵循 <strong>Apache License 2.0</strong> 开源协议，核心逆向协议依赖固化自开源项目 <code>openhongguo</code>。
            </p>
            <p className="text-[11px]">
              本软件仅供个人技术学习、协议分析与交互工程探索使用，严禁用于任何商业目的或大规模数据采集。
              短剧音视频内容及版权归原平台所有。
            </p>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted">未能获取系统诊断信息</div>
      )}
    </div>
  );
};
