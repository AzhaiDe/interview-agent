import { Form as AntForm, Input, Select, Checkbox, DatePicker, InputNumber } from 'antd';
import { Controller, useFormContext, type RegisterOptions } from 'react-hook-form';
import type { ReactNode } from 'react';

interface FormFieldProps {
  name: string;
  label?: ReactNode;
  required?: boolean;
  rules?: RegisterOptions;
  children?: ReactNode;
  className?: string;
}

type FieldType = 'text' | 'password' | 'email' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea';

interface FormInputProps extends FormFieldProps {
  type?: FieldType;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  disabled?: boolean;
}

export const FormField = ({ name, label, required, rules, children, className }: FormFieldProps) => {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      rules={{ required: required ? '此字段为必填项' : undefined, ...rules }}
      render={({ fieldState }) => {
        const error = fieldState.error;

        return (
          <AntForm.Item
            label={label}
            required={required}
            validateStatus={error ? 'error' : undefined}
            help={error?.message}
            className={className}
          >
            {children}
          </AntForm.Item>
        );
      }}
    />
  );
};

export const FormInput = ({
  name,
  label,
  required,
  rules,
  type = 'text',
  placeholder,
  options,
  disabled,
  className,
}: FormInputProps) => {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      rules={{ required: required ? '此字段为必填项' : undefined, ...rules }}
      render={({ field, fieldState }) => {
        const error = fieldState.error;

        let inputComponent: ReactNode;

        switch (type) {
          case 'password':
            inputComponent = (
              <Input.Password
                {...field}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
              />
            );
            break;
          case 'email':
          case 'text':
            inputComponent = (
              <Input
                {...field}
                type={type}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
              />
            );
            break;
          case 'number':
            inputComponent = (
              <InputNumber
                {...field}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
                className="w-full"
              />
            );
            break;
          case 'select':
            inputComponent = (
              <Select
                {...field}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
                options={options}
                className="w-full"
              />
            );
            break;
          case 'checkbox':
            inputComponent = (
              <Checkbox
                {...field}
                checked={field.value}
                disabled={disabled}
              >
                {label}
              </Checkbox>
            );
            break;
          case 'date':
            inputComponent = (
              <DatePicker
                {...field}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
                className="w-full"
              />
            );
            break;
          case 'textarea':
            inputComponent = (
              <Input.TextArea
                {...field}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
                rows={4}
              />
            );
            break;
          default:
            inputComponent = (
              <Input
                {...field}
                placeholder={placeholder}
                status={error ? 'error' : undefined}
                disabled={disabled}
              />
            );
        }

        return (
          <AntForm.Item
            label={type !== 'checkbox' ? label : undefined}
            required={required}
            validateStatus={error ? 'error' : undefined}
            help={error?.message}
            className={className}
          >
            {inputComponent}
          </AntForm.Item>
        );
      }}
    />
  );
};
