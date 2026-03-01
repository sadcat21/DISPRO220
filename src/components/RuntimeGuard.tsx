import React from 'react';

interface RuntimeGuardProps {
  children: React.ReactNode;
}

const IGNORED_PATTERNS = [
  'UIStyleError',
  'طلب تعديل من المستخدم',
  '[Respond and provide all suggestions in Arabic]',
];

const shouldIgnoreError = (value: unknown): boolean => {
  const text = typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name} ${value.message} ${value.stack || ''}`
      : JSON.stringify(value || '');

  return IGNORED_PATTERNS.some((pattern) => text.includes(pattern));
};

let guardInstalled = false;

const installRuntimeErrorGuard = () => {
  if (guardInstalled || typeof window === 'undefined') return;

  window.addEventListener(
    'error',
    (event) => {
      if (shouldIgnoreError(event.error || event.message)) {
        event.preventDefault();
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

