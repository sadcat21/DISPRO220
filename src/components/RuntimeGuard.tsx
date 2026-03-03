import React from 'react';

interface RuntimeGuardProps {
  children: React.ReactNode;
}

const IGNORED_PATTERNS = [
  'uistyleerror',
  'ui_error',
  'طلب تعديل من المستخدم',
  '[respond and provide all suggestions in arabic]',
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

  window.addEventListener(
    'error',
    (event) => {
      const payload = event.error ?? event.message ?? event;
      if (shouldIgnoreError(payload)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        console.warn('Ignored external UIStyleError:', event.message);
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (shouldIgnoreError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        console.warn('Ignored external UIStyleError rejection');
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

