import { List as AntList, type ListProps as AntListProps, Avatar } from 'antd';
import type { ReactNode } from 'react';

interface ListProps<T> extends Omit<AntListProps<T>, 'dataSource'> {
  data: T[];
  emptyText?: string;
}

export const List = <T extends object>({
  data,
  emptyText = '暂无数据',
  ...props
}: ListProps<T>) => {
  return (
    <AntList<T>
      dataSource={data}
      locale={{ emptyText }}
      {...props}
    />
  );
};

// 列表项通用布局组件
export const ListItem = ({
  avatar,
  title,
  description,
  extra,
  actions,
  children,
}: {
  avatar?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode[];
  children?: ReactNode;
}) => {
  return (
    <AntList.Item actions={actions} extra={extra}>
      <AntList.Item.Meta
        avatar={avatar}
        title={title}
        description={description}
      />
      {children}
    </AntList.Item>
  );
};

// 头像组件（带占位符）
export const UserAvatar = ({
  name,
  src,
  size = 'default',
}: {
  name?: string;
  src?: string;
  size?: 'small' | 'default' | 'large';
}) => {
  const sizeMap = {
    small: 24,
    default: 32,
    large: 40,
  };

  const initials = name
    ? name.charAt(0).toUpperCase()
    : '?';

  return (
    <Avatar
      src={src}
      size={sizeMap[size]}
      className="bg-primary-500"
    >
      {initials}
    </Avatar>
  );
};
