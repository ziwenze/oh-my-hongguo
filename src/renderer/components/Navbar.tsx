import React from 'react';
import { Film, Pin } from 'lucide-react';

interface NavbarProps {
  isAlwaysOnTop: boolean;
  onTogglePin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isAlwaysOnTop, onTogglePin }) => {
  return (
    <header className="drag-region flex items-center justify-between px-4 py-2.5 bg-surface/90 backdrop-blur-md border-b border-border z-30 select-none">
      <div className="flex items-center space-x-2 pl-16">
        <Film className="w-5 h-5 text-primary" />
        <span className="font-bold tracking-wide text-sm bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 bg-clip-text text-transparent">
          OhMyHongguo
        </span>
        <span className="text-[10px] px-1.5 py-0.2 bg-surface-hover border border-border text-muted rounded">
          Pre-Alpha
        </span>
      </div>

      <div className="no-drag flex items-center space-x-1.5">
        <button
          onClick={onTogglePin}
          title={isAlwaysOnTop ? '取消窗口置顶' : '置顶窗口摸鱼模式 (P)'}
          className={`p-1.5 rounded-lg transition-colors ${
            isAlwaysOnTop
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-muted hover:text-gray-200 hover:bg-surface-hover border border-transparent'
          }`}
        >
          <Pin className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
