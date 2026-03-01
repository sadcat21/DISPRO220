import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Plus, Trash2, Loader2, Settings, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PalletSetting {
  id?: string;
  name: string;
  boxes_per_pallet: number;
  boxes_per_layer: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  showLayerField?: boolean;
}

const PalletSettingsDialog: React.FC<Props> = ({ open, onOpenChange, branchId, showLayerField = true }) => {
  const [settings, setSettings] = useState<PalletSetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open && branchId) fetchSettings();
  }, [open, branchId]);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pallet_settings')
        .select('*')
        .eq('branch_id', branchId);
      if (error) throw error;
      setSettings((data || []).map(d => ({
        id: d.id,
        name: d.name || '',
        boxes_per_pallet: d.boxes_per_pallet,
        boxes_per_layer: d.boxes_per_layer ?? 0,
      })));
    } catch (e: any) {
      toast.error(e.message || 'تعذر تحميل الإعدادات');
    } finally {
      setIsLoading(false);
    }
  };

  const addSetting = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (settings.some(s => s.name === trimmed)) {
      toast.error('هذا النوع موجود بالفعل');
      return;
    }
    setSettings(prev => [...prev, { name: trimmed, boxes_per_pallet: 1, boxes_per_layer: 1 }]);
    setNewName('');
  };

  const removeSetting = async (index: number) => {
    const setting = settings[index];
    try {
      if (setting.id) {
        const { error } = await supabase.from('pallet_settings').delete().eq('id', setting.id);
        if (error) throw error;
      }
      setSettings(prev => prev.filter((_, i) => i !== index));
      toast.success('تم الحذف');
    } catch (e: any) {
      toast.error(e.message || 'تعذر الحذف');
    }
  };

  const updateSetting = (index: number, field: keyof PalletSetting, value: any) => {
    setSettings(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const setting of settings) {
        if (!setting.name || setting.boxes_per_pallet < 1) continue;
        const payload: any = {
          name: setting.name,
          boxes_per_pallet: setting.boxes_per_pallet,
          boxes_per_layer: setting.boxes_per_layer ?? 0,
        };
        if (setting.id) {
          const { error } = await supabase
            .from('pallet_settings')
            .update(payload)
            .eq('id', setting.id)
            .eq('branch_id', branchId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('pallet_settings')
            .insert({ ...payload, branch_id: branchId });
          if (error) throw error;
        }
      }
      toast.success('تم حفظ الإعدادات');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            إعدادات أنواع التغليف
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              حدد أنواع التغليف (مثل Fardeau، Seau) وعدد الصناديق لكل باليت {showLayerField ? 'وطبقة' : ''}
            </p>

            {settings.map((setting, index) => (
              <div key={index} className="border rounded-lg p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-bold flex-1 truncate">{setting.name}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeSetting(index)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">B/Palette</span>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={setting.boxes_per_pallet}
                      onChange={e => updateSetting(index, 'boxes_per_pallet', parseInt(e.target.value) || 1)}
                      className="text-center text-sm h-8 mt-0.5"
                    />
                  </div>
                  {showLayerField && (
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">B/Couche</span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        value={setting.boxes_per_layer}
                        onChange={e => updateSetting(index, 'boxes_per_layer', parseInt(e.target.value) || 0)}
                        className="text-center text-sm h-8 mt-0.5"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add new type */}
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="اسم النوع (مثل Fardeau)"
                className="text-sm h-8 flex-1"
                onKeyDown={e => e.key === 'Enter' && addSetting()}
              />
              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={addSetting}>
                <Plus className="w-4 h-4 ml-1" />
                إضافة
              </Button>
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حفظ الإعدادات
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PalletSettingsDialog;
