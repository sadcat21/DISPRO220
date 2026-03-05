import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

const EditWorkerProfileDialog: React.FC<Props> = ({ open, onOpenChange, workerId, workerName }) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [fullNameFr, setFullNameFr] = useState('');
  const [printName, setPrintName] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [deviceLocked, setDeviceLocked] = useState(false);
  useEffect(() => {
    if (open && workerId) {
      loadWorkerData();
    }
  }, [open, workerId]);

  const loadWorkerData = async () => {
    if (!workerId) return;
    const { data } = await supabase
      .from('workers')
      .select('full_name, full_name_fr, print_name, work_phone, personal_phone, last_device_id, last_device_info, device_locked')
      .eq('id', workerId)
      .single();
    if (data) {
      setFullName((data as any).full_name || '');
      setFullNameFr((data as any).full_name_fr || '');
      setPrintName((data as any).print_name || (data as any).full_name_fr || '');
      setWorkPhone((data as any).work_phone || '');
      setPersonalPhone((data as any).personal_phone || '');
      setDeviceId((data as any).last_device_id || '');
      setDeviceInfo((data as any).last_device_info || null);
      setDeviceLocked((data as any).device_locked || false);
    }
  };

  const handleSave = async () => {
    if (!workerId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({
          full_name: fullName,
          full_name_fr: fullNameFr,
          print_name: printName || fullNameFr || fullName,
          work_phone: workPhone || null,
          personal_phone: personalPhone || null,
          device_locked: deviceLocked,
        } as any)
        .eq('id', workerId);
      if (error) throw error;
      toast.success('تم حفظ بيانات العامل بنجاح');
      queryClient.invalidateQueries({ queryKey: ['workers-for-actions'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error('خطأ في الحفظ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            إعدادات بيانات {workerName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الاسم الكامل (بالعربية)</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="الاسم بالعربية" />
          </div>
          <div className="space-y-1.5">
            <Label>الاسم الكامل (بالفرنسية)</Label>
            <Input value={fullNameFr} onChange={e => {
              setFullNameFr(e.target.value);
              if (!printName || printName === fullNameFr) setPrintName(e.target.value);
            }} placeholder="Nom complet en français" dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>اسم الطباعة (يظهر في الوصل)</Label>
            <Input value={printName} onChange={e => setPrintName(e.target.value)} placeholder="اسم مخصص للطباعة" dir="ltr" />
            <p className="text-[10px] text-muted-foreground">يظهر هذا الاسم في وصل التوصيل والبيع المباشر</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>هاتف العمل</Label>
              <Input value={workPhone} onChange={e => setWorkPhone(e.target.value)} placeholder="0555..." dir="ltr" />
              <p className="text-[10px] text-muted-foreground">يظهر في الوصل</p>
            </div>
            <div className="space-y-1.5">
              <Label>هاتف شخصي</Label>
              <Input value={personalPhone} onChange={e => setPersonalPhone(e.target.value)} placeholder="0555..." dir="ltr" />
            </div>
          </div>

          {/* قسم بيانات الجهاز */}
          <div className="border-t pt-4 mt-2 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Smartphone className="w-4 h-4 text-primary" />
              بيانات الجهاز
            </div>
            {deviceId ? (
              <div className="space-y-2 bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">معرّف الجهاز:</span>
                  <Badge variant="outline" className="font-mono text-xs">{deviceId}</Badge>
                </div>
                {deviceInfo && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">الجهاز:</span>
                      <span>{deviceInfo.device_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المتصفح:</span>
                      <span>{deviceInfo.browser || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">الشاشة:</span>
                      <span dir="ltr">{deviceInfo.screen_resolution || '-'}</span>
                    </div>
                    {deviceInfo.timestamp && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">آخر تسجيل:</span>
                        <span className="text-xs">{new Date(deviceInfo.timestamp).toLocaleString('ar-DZ')}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-muted-foreground text-xs">قفل الحساب على هذا الجهاز</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deviceLocked}
                      onChange={(e) => setDeviceLocked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full" />
                  </label>
                </div>
                <p className="text-[10px] text-muted-foreground">عند التفعيل، لن يتمكن هذا العامل من تسجيل الدخول من جهاز مختلف</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">لم يتم تسجيل بيانات جهاز بعد. ستظهر عند أول تسجيل دخول.</p>
            )}
          </div>

          <Button onClick={handleSave} disabled={loading || !fullName} className="w-full gap-2">
            <Save className="w-4 h-4" />
            {loading ? 'جاري الحفظ...' : 'حفظ البيانات'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditWorkerProfileDialog;
