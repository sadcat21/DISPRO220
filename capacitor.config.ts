import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.laserfood.app',
  appName: 'Laser Food',
  webDir: 'dist',
  server: {
    url: 'https://dispro62.vercel.app/',
    cleartext: true
  },
  plugins: {
    AppUpdate: {
      url: 'https://api.laserfood.com/updates' // سيتم استبداله برابط من إعدادات التطبيق
    }
  }
};

export default config;
