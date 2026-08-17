import React from 'react';
import { Button as AntButton, type ButtonProps as AntButtonProps } from 'antd';
import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps extends Omit<AntButtonProps, 'type' | 'size' | 'variant'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

const variantMap: Record<ButtonVariant, AntButtonProps['type']> = {
  primary: 'primary',
  secondary: 'default',
  ghost: 'link',
  danger: 'primary',
};

const sizeMap: Record<ButtonSize, AntButtonProps['size']> = {
  small: 'small',
  medium: 'middle',
  large: 'large',
};

export const Button = React.memo(({
  variant = 'primary',
  size = 'medium',
  children,
  danger,
  className = '',
  ...props
}: ButtonProps) => {
  const type = variantMap[variant];
  const buttonSize = sizeMap[size];
  const isDanger = variant === 'danger' || danger;

  return (
    <AntButton
      type={type}
      size={buttonSize}
      danger={isDanger}
      className={`
        ${variant === 'secondary' ? 'border-primary-500 text-primary-500' : ''}
        ${variant === 'ghost' ? 'text-primary-600' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </AntButton>
  );
});

Button.displayName = 'Button';
