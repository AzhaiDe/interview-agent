import { Input as AntInput, type InputProps as AntInputProps } from 'antd';
import { forwardRef } from 'react';

export type InputSize = 'small' | 'medium' | 'large';

interface InputProps extends Omit<AntInputProps, 'size'> {
  size?: InputSize;
  error?: boolean;
  errorMessage?: string;
}

const sizeMap: Record<InputSize, AntInputProps['size']> = {
  small: 'small',
  medium: 'middle',
  large: 'large',
};

export const Input = forwardRef<any, InputProps>(
  ({ size = 'medium', error, errorMessage, className = '', ...props }, ref) => {
    const inputSize = sizeMap[size];

    return (
      <div className="w-full">
        <AntInput
          ref={ref}
          size={inputSize}
          status={error ? 'error' : undefined}
          className={`
            ${error ? 'border-red-500 focus:border-red-500' : ''}
            ${className}
          `.trim()}
          {...props}
        />
        {error && errorMessage && (
          <div className="mt-1 text-sm text-red-500">{errorMessage}</div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
