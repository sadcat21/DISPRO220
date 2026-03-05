/**
 * Generates a simple device fingerprint based on available browser/device properties.
 * Not cryptographically unique but sufficient for device identification.
 */
export const getDeviceFingerprint = (): string => {
  const nav = navigator;
  const screen = window.screen;
  
  const components = [
    nav.userAgent,
    nav.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    nav.hardwareConcurrency?.toString() || '',
    (nav as any).deviceMemory?.toString() || '',
    nav.platform || '',
  ];
  
  // Simple hash
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export const getDeviceInfo = () => {
  const nav = navigator;
  const screen = window.screen;
  const ua = nav.userAgent;
  
  // Extract device/browser info from user agent
  let deviceName = 'Unknown';
  let browser = 'Unknown';
  
  if (/Android/.test(ua)) {
    const match = ua.match(/Android[\s/][\d.]+;?\s*([^;)]+)/);
    deviceName = match?.[1]?.trim() || 'Android Device';
  } else if (/iPhone|iPad/.test(ua)) {
    deviceName = ua.match(/(iPhone|iPad)/)?.[1] || 'iOS Device';
  } else {
    deviceName = nav.platform || 'Desktop';
  }
  
  if (/Chrome/.test(ua) && !/Edge/.test(ua)) browser = 'Chrome';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua)) browser = 'Safari';
  else if (/Edge/.test(ua)) browser = 'Edge';
  
  return {
    device_name: deviceName,
    browser,
    screen_resolution: `${screen.width}x${screen.height}`,
    platform: nav.platform || '',
    language: nav.language,
    user_agent: ua.substring(0, 200),
    timestamp: new Date().toISOString(),
  };
};
