import React, { useMemo } from 'react';
import { Table as AntTable, type TableProps as AntTableProps, Tag, Space } from 'antd';
import type { ReactNode } from 'react';

export type TableVariant = 'default' | 'compact' | 'comfortable';

interface TableProps<T> extends AntTableProps<T> {
  variant?: TableVariant;
  emptyText?: string;
}

const sizeMap: Record<TableVariant, AntTableProps<any>['size']> = {
  default: 'middle',
  compact: 'small',
  comfortable: 'large',
};

export const Table = <T extends object>({
  variant = 'default',
  emptyText = '暂无数据',
  columns,
  ...props
}: TableProps<T>) => {
  const tableSize = sizeMap[variant];

  const pagination = useMemo(() => ({
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number) => `共 ${total} 条`,
    ...props.pagination,
  }), [props.pagination]);

  return (
    <AntTable<T>
      size={tableSize}
      columns={columns}
      locale={{ emptyText }}
      pagination={pagination}
      {...props}
    />
  );
};

Table.displayName = 'Table';

// 导出常用的 Tag 组件用于表格状态展示
export const StatusTag = React.memo(({ status, text }: { status: 'success' | 'warning' | 'error' | 'default'; text: string }) => {
  const colorMap: Record<string, string> = {
    success: 'green',
    warning: 'orange',
    error: 'red',
    default: 'gray',
  };

  return <Tag color={colorMap[status]}>{text}</Tag>;
});

StatusTag.displayName = 'StatusTag';

export const ActionButtons = React.memo(({ children }: { children: ReactNode }) => {
  return <Space size="small">{children}</Space>;
});

ActionButtons.displayName = 'ActionButtons';
