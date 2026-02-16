/**
 * Notifications Hook
 *
 * AVB routing adapter for the app-wide toast notification system.
 */

import { useCallback } from 'react';
import { useNotifications as useAppNotifications } from '../../Toasts';

type VariantType = 'default' | 'error' | 'success' | 'warning' | 'info';
type SnackbarKey = string;

export interface NotificationOptions {
  duration?: number;
  persist?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface NotificationAPI {
  success: (message: string, options?: NotificationOptions) => SnackbarKey;
  error: (message: string, options?: NotificationOptions) => SnackbarKey;
  warning: (message: string, options?: NotificationOptions) => SnackbarKey;
  info: (message: string, options?: NotificationOptions) => SnackbarKey;
  default: (message: string, options?: NotificationOptions) => SnackbarKey;
  close: (_key: SnackbarKey) => void;
  closeAll: () => void;
}

function toneFromVariant(variant: VariantType): 'info' | 'success' | 'warn' | 'error' {
  if (variant === 'success') return 'success';
  if (variant === 'error') return 'error';
  if (variant === 'warning') return 'warn';
  return 'info';
}

export function useNotifications(): NotificationAPI {
  const { pushNotification, clearNotifications } = useAppNotifications();

  const notify = useCallback(
    (message: string, variant: VariantType, options?: NotificationOptions): SnackbarKey => {
      if (options?.action) {
        const actionText = ` [${options.action.label}]`;
        pushNotification(`${message}${actionText}`, toneFromVariant(variant));
      } else {
        pushNotification(message, toneFromVariant(variant));
      }
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    },
    [pushNotification]
  );

  return {
    success: useCallback(
      (message: string, options?: NotificationOptions) => notify(message, 'success', options),
      [notify]
    ),
    error: useCallback(
      (message: string, options?: NotificationOptions) => notify(message, 'error', options),
      [notify]
    ),
    warning: useCallback(
      (message: string, options?: NotificationOptions) => notify(message, 'warning', options),
      [notify]
    ),
    info: useCallback(
      (message: string, options?: NotificationOptions) => notify(message, 'info', options),
      [notify]
    ),
    default: useCallback(
      (message: string, options?: NotificationOptions) => notify(message, 'default', options),
      [notify]
    ),
    close: useCallback((_key: SnackbarKey) => {}, []),
    closeAll: useCallback(() => clearNotifications(), [clearNotifications]),
  };
}

export default useNotifications;

