import React from 'react';
import { Empty as AntEmpty, type EmptyProps as AntEmptyProps } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { Button } from './Button';

export type EmptySize = 'small' | 'medium' | 'large';

interface EmptyProps extends Omit<AntEmptyProps, 'size'> {
  size?: EmptySize;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

const sizeMap: Record<EmptySize, number> = {
  small: 80,
  medium: 120,
  large: 160,
};

export const Empty = React.memo(({
  size = 'medium',
  description = '暂无数据',
  actionText,
  onAction,
  ...props
}: EmptyProps) => {
  const imageSize = sizeMap[size];

  return (
    <AntEmpty
      image={<InboxOutlined style={{ fontSize: imageSize, color: '#d1d5db' }} />}
      description={
        <span className="text-gray-500">{description}</span>
      }
      {...props}
    >
      {onAction && actionText && (
        <Button onClick={onAction} aria-label={actionText}>
          {actionText}
        </Button>
      )}
    </AntEmpty>
  );
});

Empty.displayName = 'Empty';
