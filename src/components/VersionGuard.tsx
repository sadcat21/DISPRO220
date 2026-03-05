import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// رقم إصدار التطبيق الحالي - يجب تحديثه مع كل APK جديد
export const APP_VERSION = 1;

const VersionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [updateUrl, setUpdateUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkVersion();
  }, []);

  const checkVersion = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .is('branch_id', null)
        .in('key', ['app_min_version', 'app_update_url']);

      if (error) {
        console.error('Version check failed:', error);
        setLoading(false);
        return;
      }

      const settings: Record<string, string> = {};
      data?.forEach(row => { settings[row.key] = row.value; });

      const minVersion = parseInt(settings['app_min_version'] || '0', 10);
      const url = settings['app_update_url'] || '';

      if (minVersion > APP_VERSION) {
        setNeedsUpdate(true);
        setUpdateUrl(url);
      }
    } catch {
      console.error('Version check error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  if (needsUpdate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">تحديث مطلوب</h1>
          <p className="text-muted-foreground leading-relaxed">
            يوجد إصدار جديد من التطبيق. يرجى تحديث التطبيق للاستمرار في الاستخدام.
          </p>
          <p className="text-sm text-muted-foreground">
            الإصدار الحالي: <span className="font-mono">{APP_VERSION}</span>
          </p>
          {updateUrl && (
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => window.open(updateUrl, '_blank')}
            >
              <Download className="w-5 h-5" />
              تحميل التحديث
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkVersion()}
          >
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default VersionGuard;
