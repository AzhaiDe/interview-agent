import { Modal as AntModal, type ModalProps as AntModalProps } from 'antd';
import type { ReactNode } from 'react';
import { Button } from './Button';

export type ModalSize = 'small' | 'medium' | 'large' | 'xlarge';

interface ModalProps extends Omit<AntModalProps, 'size'> {
  size?: ModalSize;
  children?: ReactNode;
  onClose?: () => void;
}

const sizeWidthMap: Record<ModalSize, number> = {
  small: 400,
  medium: 520,
  large: 720,
  xlarge: 960,
};

export const Modal = ({
  size = 'medium',
  children,
  onClose,
  onOk,
  okText = '确定',
  cancelText = '取消',
  ...props
}: ModalProps) => {
  const width = sizeWidthMap[size];

  return (
    <AntModal
      width={width}
      centered
      destroyOnClose
      onCancel={() => {
        onClose?.();
      }}
      footer={[
        <Button key="cancel" variant="secondary" onClick={onClose}>
          {cancelText}
        </Button>,
        <Button key="ok" variant="primary" onClick={onOk}>
          {okText}
        </Button>,
      ]}
      {...props}
    >
      {children}
    </AntModal>
  );
};
