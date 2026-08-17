import { message } from 'antd';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ToastDuration = 'short' | 'medium' | 'long';

const durationMap: Record<ToastDuration, number> = {
  short: 2,
  medium: 4,
  long: 6,
};

interface ToastOptions {
  content: string;
  duration?: ToastDuration;
}

export const toast = {
  success: ({ content, duration = 'medium' }: ToastOptions) => {
    message.success(content, durationMap[duration]);
  },

  error: ({ content, duration = 'long' }: ToastOptions) => {
    message.error(content, durationMap[duration]);
  },

  info: ({ content, duration = 'medium' }: ToastOptions) => {
    message.info(content, durationMap[duration]);
  },

  warning: ({ content, duration = 'medium' }: ToastOptions) => {
    message.warning(content, durationMap[duration]);
  },
};

// 便捷函数
export const showToast = (type: ToastType, content: string, duration: ToastDuration = 'medium') => {
  toast[type]({ content, duration });
};
