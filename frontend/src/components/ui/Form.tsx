import { Form as AntForm, type FormInstance } from 'antd';
import type { ReactNode } from 'react';
import { type FieldValues, useForm, type UseFormReturn, FormProvider, type UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

interface FormProps<T extends FieldValues> {
  form?: FormInstance;
  hookForm?: UseFormReturn<T>;
  schema?: z.ZodType<T>;
  onSubmit: (values: T) => void | Promise<void>;
  children?: ReactNode;
  className?: string;
  layout?: 'horizontal' | 'vertical' | 'inline';
}

export function Form<T extends FieldValues>({
  hookForm,
  schema,
  onSubmit,
  children,
  form,
  className,
  layout = 'vertical',
}: FormProps<T>) {
  // Always call hooks in the same order. When a caller supplies an external
  // form, the internal instance is simply ignored.
  const internalHookForm = useForm<T>({
    resolver: schema ? zodResolver(schema) : undefined,
  } as UseFormProps<T>);
  const hookFormInstance = hookForm || internalHookForm;

  const { handleSubmit } = hookFormInstance;

  return (
    <FormProvider {...hookFormInstance}>
      <AntForm
        form={form}
        layout={layout}
        className={className}
        onFinish={handleSubmit((values) => onSubmit(values))}
      >
        {children}
      </AntForm>
    </FormProvider>
  );
}
