import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Save, Loader2, RotateCcw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { sendSmsDirectly } from '@/utils/smsHelper';

export type SmsOperationType = 'delivery' | 'direct_sale' | 'order_create' | 'debt_collection' | 'document_collection';
export type SmsSendMode = 'automatic' | 'semi_automatic' | 'disabled';

export interface SmsOperationConfig {
  enabled: boolean;
  mode: SmsSendMode;
  template: string;
}

export type SmsSettings = Record<SmsOperationType, SmsOperationConfig>;

const OPERATION_LABELS: Record<SmsOperationType, string> = {
  delivery: 'التوصيل',
  direct_sale: 'البيع المباشر',
  order_create: 'إنشاء طلبية',
  debt_collection: 'تحصيل دين',
  document_collection: 'تحصيل مستند',
};

const MODE_LABELS: Record<SmsSendMode, string> = {
  automatic: 'تلقائي بالكامل',
  semi_automatic: 'شبه تلقائي (فتح تطبيق الرسائل)',
  disabled: 'بدون إرسال',
};

const DEFAULT_TEMPLATES: Record<SmsOperationType, string> = {
  delivery: `تم التوصيل بنجاح
{company}
العميل: {customer}
الطلب: {order_id}
الإجمالي: {total} دج
{payment_status}
شكراً لتعاملكم معنا`,
  direct_sale: `تم البيع المباشر
{company}
العميل: {customer}
الإجمالي: {total} دج
{payment_status}
شكراً لتعاملكم معنا`,
  order_create: `تم إنشاء طلبية جديدة
{company}
العميل: {customer}
الطلب: {order_id}
الإجمالي: {total} دج
سيتم التوصيل قريباً`,
  debt_collection: `تم تحصيل دفعة
{company}
العميل: {customer}
المبلغ المحصل: {amount} دج
المتبقي: {remaining} دج
شكراً لتعاملكم معنا`,
  document_collection: `تم تحصيل المستند
{company}
العميل: {customer}
رقم الطلب: {order_id}
شكراً لتعاملكم معنا`,
};

const getDefaultSettings = (): SmsSettings => ({
  delivery: { enabled: true, mode: 'automatic', template: DEFAULT_TEMPLATES.delivery },
  direct_sale: { enabled: true, mode: 'automatic', template: DEFAULT_TEMPLATES.direct_sale },
  order_create: { enabled: false, mode: 'disabled', template: DEFAULT_TEMPLATES.order_create },
  debt_collection: { enabled: false, mode: 'disabled', template: DEFAULT_TEMPLATES.debt_collection },
  document_collection: { enabled: false, mode: 'disabled', template: DEFAULT_TEMPLATES.document_collection },
});

const SMS_SETTINGS_KEY = 'sms_settings';

const SmsSettingsCard: React.FC = () => {
  const { activeBranch } = useAuth();
  const [settings, setSettings] = useState<SmsSettings>(getDefaultSettings());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, [activeBranch]);

  const loadSettings = async () => {
    try {
      const query = supabase
        .from('app_settings')
        .select('value')
        .eq('key', SMS_SETTINGS_KEY);

      if (activeBranch) {
        query.eq('branch_id', activeBranch.id);
      } else {
        query.is('branch_id', null);
      }

      const { data } = await query.maybeSingle();
      if (data?.value) {
        const parsed = JSON.parse(data.value);
        // Merge with defaults to ensure all keys exist
        const merged = getDefaultSettings();
        for (const key of Object.keys(merged) as SmsOperationType[]) {
          if (parsed[key]) {
            merged[key] = { ...merged[key], ...parsed[key] };
          }
        }
        setSettings(merged);
      }
    } catch (err) {
      console.error('Failed to load SMS settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const branchId = activeBranch?.id || null;
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            key: SMS_SETTINGS_KEY,
            value: JSON.stringify(settings),
            branch_id: branchId,
          },
          { onConflict: 'branch_id,key' }
        );

      if (error) throw error;
      toast.success('تم حفظ إعدادات الرسائل');
    } catch (err) {
      console.error('Failed to save SMS settings:', err);
      toast.error('فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const updateOperation = (op: SmsOperationType, updates: Partial<SmsOperationConfig>) => {
    setSettings(prev => ({
      ...prev,
      [op]: { ...prev[op], ...updates },
    }));
  };

  const toggleEnabled = (op: SmsOperationType) => {
    const newEnabled = !settings[op].enabled;
    updateOperation(op, {
      enabled: newEnabled,
      mode: newEnabled ? 'automatic' : 'disabled',
    });
  };

  const resetTemplate = (op: SmsOperationType) => {
    updateOperation(op, { template: DEFAULT_TEMPLATES[op] });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="w-5 h-5" />
          إعدادات رسائل SMS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {(Object.keys(OPERATION_LABELS) as SmsOperationType[]).map((op) => (
          <div key={op} className="border rounded-lg p-4 space-y-3">
            {/* Header with toggle */}
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-base">{OPERATION_LABELS[op]}</Label>
              <Switch
                checked={settings[op].enabled}
                onCheckedChange={() => toggleEnabled(op)}
              />
            </div>

            {settings[op].enabled && (
              <>
                {/* Send mode */}
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">طريقة الإرسال</Label>
                  <Select
                    value={settings[op].mode}
                    onValueChange={(val) => updateOperation(op, { mode: val as SmsSendMode })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">{MODE_LABELS.automatic}</SelectItem>
                      <SelectItem value="semi_automatic">{MODE_LABELS.semi_automatic}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {settings[op].mode === 'automatic'
                      ? 'يتم إرسال الرسالة تلقائياً في الخلفية بدون تدخل العامل'
                      : 'يتم فتح تطبيق الرسائل برسالة جاهزة والعامل يضغط إرسال'}
                  </p>
                </div>

                {/* Template */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">قالب الرسالة</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetTemplate(op)}
                      className="h-7 text-xs gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      استعادة الافتراضي
                    </Button>
                  </div>
                  <Textarea
                    value={settings[op].template}
                    onChange={(e) => updateOperation(op, { template: e.target.value })}
                    className="min-h-[120px] text-sm font-mono"
                    dir="rtl"
                  />
                  <p className="text-xs text-muted-foreground">
                    المتغيرات المتاحة: {'{customer}'} {'{total}'} {'{order_id}'} {'{company}'} {'{amount}'} {'{remaining}'} {'{payment_status}'}
                  </p>
                </div>

                {/* Test SMS */}
                <SmsTestSection op={op} template={settings[op].template} mode={settings[op].mode} />
              </>
            )}
          </div>
        ))}

        <Button onClick={saveSettings} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ إعدادات الرسائل
        </Button>
      </CardContent>
    </Card>
  );
};

export default SmsSettingsCard;

/**
 * SMS Test Section - allows testing SMS sending per operation
 */
const SmsTestSection: React.FC<{ op: SmsOperationType; template: string; mode: SmsSendMode }> = ({ op, template, mode }) => {
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending] = useState(false);

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast.error('أدخل رقم هاتف للاختبار');
      return;
    }
    const testVars: Record<string, string> = {
      customer: 'عميل تجريبي',
      total: '5000',
      order_id: 'TEST1234',
      company: 'شركة تجريبية',
      amount: '2000',
      remaining: '3000',
      payment_status: 'دين جزئي',
    };
    const message = buildSmsFromTemplate(template, testVars);

    if (mode === 'automatic') {
      setSending(true);
      const sent = await sendSmsDirectly(testPhone, message);
      setSending(false);
      if (sent) {
        toast.success('تم إرسال الرسالة التجريبية بنجاح');
      } else {
        toast.error('فشل إرسال الرسالة. تأكد من صلاحيات SMS أو استخدم APK');
      }
    } else if (mode === 'semi_automatic') {
      openSmsApp(testPhone, message);
      toast.success('تم فتح تطبيق الرسائل');
    } else {
      toast.info('الإرسال معطل لهذه العملية');
    }
  };

  return (
    <div className="border-t pt-3 space-y-2">
      <Label className="text-sm text-muted-foreground">🧪 اختبار الرسالة</Label>
      <div className="flex gap-2">
        <Input
          placeholder="رقم الهاتف للاختبار"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          className="flex-1 text-sm"
          dir="ltr"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={sending}
          className="gap-1 shrink-0"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          اختبار
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        سيتم إرسال رسالة تجريبية بقيم وهمية بنمط «{mode === 'automatic' ? 'تلقائي' : mode === 'semi_automatic' ? 'شبه تلقائي' : 'معطل'}»
      </p>
    </div>
  );
};

/**
 * Helper to load SMS settings from app_settings (for use in other components)
 */
export const loadSmsSettings = async (branchId?: string | null): Promise<SmsSettings> => {
  try {
    const query = supabase
      .from('app_settings')
      .select('value')
      .eq('key', SMS_SETTINGS_KEY);

    if (branchId) {
      query.eq('branch_id', branchId);
    } else {
      query.is('branch_id', null);
    }

    const { data } = await query.maybeSingle();
    if (data?.value) {
      const parsed = JSON.parse(data.value);
      const merged = getDefaultSettings();
      for (const key of Object.keys(merged) as SmsOperationType[]) {
        if (parsed[key]) {
          merged[key] = { ...merged[key], ...parsed[key] };
        }
      }
      return merged;
    }
  } catch (err) {
    console.error('Failed to load SMS settings:', err);
  }
  return getDefaultSettings();
};

/**
 * Build SMS message from template and variables
 */
export const buildSmsFromTemplate = (template: string, vars: Record<string, string>): string => {
  let message = template;
  for (const [key, value] of Object.entries(vars)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return message;
};

/**
 * Open native SMS app with pre-filled message (semi-automatic mode)
 */
export const openSmsApp = (phone: string, message: string): void => {
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  const encodedMessage = encodeURIComponent(message);
  window.open(`sms:${cleanPhone}?body=${encodedMessage}`, '_system');
};
