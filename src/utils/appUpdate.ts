import { AppUpdate } from '@capawesome/capacitor-app-update';
import { Capacitor } from '@capacitor/core';

/**
 * فحص وجود تحديثات للتطبيق
 * يعمل فقط على الأجهزة الأصلية (Android/iOS)
 */
export const checkForAppUpdate = async (): Promise<{ available: boolean; version?: string }> => {
  if (!Capacitor.isNativePlatform()) {
    console.log('App update check is only available on native platforms');
    return { available: false };
  }

  try {
    const result = await AppUpdate.getAppUpdateInfo();
    const available = (result as any).updateAvailability === 2; // UPDATE_AVAILABLE
    return {
      available,
      version: result.availableVersionName ?? undefined
    };
  } catch (error) {
    console.error('Error checking for app updates:', error);
    return { available: false };
  }
};

/**
 * تنفيذ التحديث إذا كان متوفراً
 */
export const performAppUpdate = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    console.log('App update is only available on native platforms');
    return false;
  }

  try {
    await AppUpdate.performImmediateUpdate();
    return true;
  } catch (error) {
    console.error('Error performing app update:', error);
    return false;
  }
};

/**
 * الحصول على معلومات الإصدار الحالي
 */
export const getCurrentAppVersion = async (): Promise<string | null> => {
  try {
    const result = await AppUpdate.getAppUpdateInfo();
    return result.currentVersionName;
  } catch (error) {
    console.error('Error getting current app version:', error);
    return null;
  }
};
