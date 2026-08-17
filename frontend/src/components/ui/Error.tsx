import React from 'react';
import { Alert, Result } from 'antd';
import { WarningOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button } from './Button';

export type ErrorVariant = 'alert' | 'result' | 'inline';
export type ErrorSeverity = 'error' | 'warning' | 'info';

interface ErrorProps {
  message: string;
  description?: string;
  variant?: ErrorVariant;
  severity?: ErrorSeverity;
  onRetry?: () => void;
  retryText?: string;
}

const iconMap: Record<ErrorSeverity, React.ReactNode> = {
  error: <CloseCircleOutlined className="text-red-500" />,
  warning: <WarningOutlined className="text-orange-500" />,
  info: <InfoCircleOutlined className="text-blue-500" />,
};

export const Error = React.memo(({
  message,
  description,
  variant = 'alert',
  severity = 'error',
  onRetry,
  retryText = '重试',
}: ErrorProps) => {
  if (variant === 'alert') {
    return (
      <Alert
        type={severity}
        message={message}
        description={description}
        showIcon
        icon={iconMap[severity]}
        action={
          onRetry ? (
            <Button size="small" onClick={onRetry} variant="secondary" aria-label={retryText}>
              {retryText}
            </Button>
          ) : null
        }
        role="alert"
        aria-live="assertive"
      />
    );
  }

  if (variant === 'result') {
    return (
      <Result
        status={severity}
        title={message}
        subTitle={description}
        extra={
          onRetry ? (
            <Button onClick={onRetry} aria-label={retryText}>{retryText}</Button>
          ) : null
        }
      />
    );
  }

  // inline variant
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 rounded" role="alert">
      {iconMap[severity]}
      <div className="flex-1">
        <div className="text-sm font-medium text-red-900">{message}</div>
        {description && (
          <div className="mt-1 text-xs text-red-700">{description}</div>
        )}
        {onRetry && (
          <Button size="small" onClick={onRetry} variant="secondary" className="mt-2" aria-label={retryText}>
            {retryText}
          </Button>
        )}
      </div>
    </div>
  );
});

Error.displayName = 'Error';
