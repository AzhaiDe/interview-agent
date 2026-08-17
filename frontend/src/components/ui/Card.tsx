import React from 'react';
import { Card as AntCard, type CardProps as AntCardProps } from 'antd';
import type { ReactNode } from 'react';

export type CardVariant = 'default' | 'outlined' | 'elevated';

interface CardProps extends Omit<AntCardProps, 'variant'> {
  variant?: CardVariant;
  children?: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'border border-gray-200 shadow-sm',
  outlined: 'border-2 border-gray-300',
  elevated: 'border-0 shadow-lg',
};

export const Card = React.memo(({
  variant = 'default',
  children,
  className = '',
  ...props
}: CardProps) => {
  return (
    <AntCard
      className={`
        ${variantClasses[variant]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </AntCard>
  );
});

Card.displayName = 'Card';
