import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { Spin } from 'antd';

export type LoadingSize = 'small' | 'medium' | 'large';
export type LoadingVariant = 'spinner' | 'dots' | 'pulse';

interface LoadingProps {
  size?: LoadingSize;
  variant?: LoadingVariant;
  fullScreen?: boolean;
  text?: string;
}

const sizeMap: Record<LoadingSize, number> = {
  small: 16,
  medium: 24,
  large: 40,
};

export const Loading = React.memo(({
  size = 'medium',
  fullScreen = false,
  text,
}: LoadingProps) => {
  const spinSize = sizeMap[size];

  const indicator = (
    <LoadingOutlined style={{ fontSize: spinSize }} spin />
  );

  const content = (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <Spin indicator={indicator} />
      {text && <div className="text-sm text-gray-500">{text}</div>}
      <span className="sr-only">加载中</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="加载对话框"
      >
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      {content}
    </div>
  );
});

Loading.displayName = 'Loading';
