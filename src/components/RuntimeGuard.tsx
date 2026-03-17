import React from 'react';

interface RuntimeGuardProps {
  children: React.ReactNode;
}

const IGNORED_PATTERNS = [
  'uistyleerror',
  'ui_error',
  'طلب تعديل من المستخدم',
  '[respond and provide all suggestions in arabic]',
  'respond and provide all suggestions in arabic',
];

const toSafeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name} ${value.message} ${value.stack || ''}`;
  try {
    return JSON.stringify(value ?? '');
  } catch {
    return String(value ?? '');
  }
};

const shouldIgnoreError = (value: unknown): boolean => {
  const text = toSafeText(value).toLowerCase();
  return IGNORED_PATTERNS.some((pattern) => text.includes(pattern));
};

let guardInstalled = false;

const installRuntimeErrorGuard = () => {
  if (guardInstalled || typeof window === 'undefined') return;

  const suppressIgnoredError = (value: unknown, fallbackMessage?: string): boolean => {
    if (!shouldIgnoreError(value)) return false;
    console.warn('Ignored external UIStyleError:', fallbackMessage ?? toSafeText(value));
    return true;
  };

  const previousOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (suppressIgnoredError(error ?? message, String(message))) return true;
    if (typeof previousOnError === 'function') {
      return previousOnError(message, source, lineno, colno, error);
    }
    return false;
  };

  const previousOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    if (suppressIgnoredError(event.reason, 'Unhandled rejection')) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (typeof previousOnUnhandledRejection === 'function') {
      return previousOnUnhandledRejection.call(window, event);
    }
  };

  window.addEventListener(
    'error',
    (event) => {
      const payload = event.error ?? event.message ?? event;
      if (suppressIgnoredError(payload, event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (suppressIgnoredError(event.reason, 'Unhandled rejection')) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    },
    true
  );

  guardInstalled = true;
};

installRuntimeErrorGuard();

const RuntimeGuard: React.FC<RuntimeGuardProps> = ({ children }) => {
  return <>{children}</>;
};

export default RuntimeGuard;

