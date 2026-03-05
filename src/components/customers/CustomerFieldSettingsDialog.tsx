import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Settings2 } from 'lucide-react';
import { useCustomerFieldSettings } from '@/hooks/useCustomerFieldSettings';
import {
  CustomerFieldKey,
  CustomerFieldSettings,
  CUSTOMER_FIELD_OPTIONS,
} from '@/types/customerFieldSettings';

interface CustomerFieldSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TAB_CONFIG = [
  { value: 'editable', label: 'قابل للتعديل للعمال', key: 'editableByWorkers' as const },
  { value: 'completion', label: 'يُحتسب في الاكتمال', key: 'completionFields' as const },
  { value: 'requiredEdit', label: 'إلزامي في التعديل', key: 'requiredOnEdit' as const },
  { value: 'requiredCreate', label: 'إلزامي في الإضافة', key: 'requiredOnCreate' as const },
];

const CustomerFieldSettingsDialog: React.FC<CustomerFieldSettingsDialogProps> = ({ open, onOpenChange }) => {
  const { settings, isLoading, saveSettings, isSaving } = useCustomerFieldSettings();
  const [draft, setDraft] = useState<CustomerFieldSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  const counts = useMemo(
    () => ({
      editable: draft.editableByWorkers.length,
      completion: draft.completionFields.length,
      requiredEdit: draft.requiredOnEdit.length,
      requiredCreate: draft.requiredOnCreate.length,
    }),
    [draft],
  );

  const toggleField = (
    target: 'editableByWorkers' | 'completionFields' | 'requiredOnEdit' | 'requiredOnCreate',
    fieldKey: CustomerFieldKey,
    checked: boolean,
  ) => {
    setDraft((prev) => {
      const source = prev[target];
      const nextValues = checked
        ? Array.from(new Set([...source, fieldKey]))
        : source.filter((item) => item !== fieldKey);

      return {
        ...prev,
        [target]: nextValues,
      };
    });
  };

  const handleSave = () => {
    saveSettings(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            إعدادات حقول العميل
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Tabs defaultValue="editable" className="w-full" dir="rtl">
              <TabsList className="grid w-full grid-cols-4 h-auto">
                <TabsTrigger value="editable" className="text-[11px] py-2">تعديل ({counts.editable})</TabsTrigger>
                <TabsTrigger value="completion" className="text-[11px] py-2">اكتمال ({counts.completion})</TabsTrigger>
                <TabsTrigger value="requiredEdit" className="text-[11px] py-2">إلزامي تعديل ({counts.requiredEdit})</TabsTrigger>
                <TabsTrigger value="requiredCreate" className="text-[11px] py-2">إلزامي إضافة ({counts.requiredCreate})</TabsTrigger>
              </TabsList>

              {TAB_CONFIG.map((tab) => (
                <TabsContent key={tab.value} value={tab.value} className="mt-3">
                  <ScrollArea className="h-[320px] rounded-md border p-3">
                    <div className="space-y-3">
                      {CUSTOMER_FIELD_OPTIONS.map((field) => {
                        const checked = draft[tab.key].includes(field.key);
                        return (
                          <div key={field.key} className="flex items-center justify-between rounded-md border p-2">
                            <Label htmlFor={`${tab.value}-${field.key}`} className="text-sm cursor-pointer">
                              {field.label}
                            </Label>
                            <Switch
                              id={`${tab.value}-${field.key}`}
                              checked={checked}
                              onCheckedChange={(value) => toggleField(tab.key, field.key, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CustomerFieldSettingsDialog;
