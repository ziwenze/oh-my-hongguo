import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  isLoading?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = '暂无相关内容',
  description = '未检索到可用短剧数据，请检查网络或切换分类标签',
  onRetry,
  isLoading = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center text-muted mb-3">
        <AlertCircle className="w-6 h-6 opacity-60" />
      </div>
      <h3 className="text-sm font-semibold text-gray-200 mb-1">{title}</h3>
      <p className="text-xs text-muted max-w-xs mb-4 leading-relaxed">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isLoading}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-surface hover:bg-surface-hover active:bg-primary border border-border rounded-xl text-xs text-gray-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? '重试中...' : '重新加载'}</span>
        </button>
      )}
    </div>
  );
};
