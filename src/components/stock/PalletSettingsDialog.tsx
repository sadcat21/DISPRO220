import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Trash2, Loader2, Settings, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Product } from '@/types/database';
import SimpleProductPickerDialog from './SimpleProductPickerDialog';

interface PalletSetting {
  id?: string;
  product_id: string;
  boxes_per_pallet: number;
  boxes_per_layer: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  products: Product[];
  showLayerField?: boolean;
}

const PalletSettingsDialog: React.FC<Props> = ({ open, onOpenChange, branchId, products, showLayerField = false }) => {
  const [settings, setSettings] = useState<PalletSetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && branchId) {
      fetchSettings();
    }
  }, [open, branchId]);

  const fetchSettings = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('pallet_settings')
      .select('*')
      .eq('branch_id', branchId);
    setSettings((data || []).map(d => ({
      id: d.id,
      product_id: d.product_id,
      boxes_per_pallet: d.boxes_per_pallet,
      boxes_per_layer: (d as any).boxes_per_layer || 0,
    })));
    setIsLoading(false);
  };

  const addSetting = () => {
    setSettings(prev => [...prev, { product_id: '', boxes_per_pallet: 1, boxes_per_layer: 1 }]);
  };

  const removeSetting = async (index: number) => {
    const setting = settings[index];
    if (setting.id) {
      await supabase.from('pallet_settings').delete().eq('id', setting.id);
    }
    setSettings(prev => prev.filter((_, i) => i !== index));
    toast.success('تم الحذف');
  };

  const updateSetting = (index: number, field: keyof PalletSetting, value: any) => {
    setSettings(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const setting of settings) {
        if (!setting.product_id || setting.boxes_per_pallet < 1) continue;
        const payload: any = {
          boxes_per_pallet: setting.boxes_per_pallet,
          boxes_per_layer: setting.boxes_per_layer || 0,
        };
        if (setting.id) {
          await supabase.from('pallet_settings').update(payload).eq('id', setting.id);
        } else {
          await supabase.from('pallet_settings').insert({
            product_id: setting.product_id,
            branch_id: branchId,
            ...payload,
          });
        }
      }
      toast.success('تم حفظ إعدادات الباليطات');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  const getProductName = (productId: string) => {
    return products.find(p => p.id === productId)?.name || 'اختر منتج';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            إعدادات الباليطات
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              حدد عدد الصناديق التي تتسعها كل باليت {showLayerField ? 'وكل طبقة ' : ''}لكل منتج
            </p>

            {settings.map((setting, index) => (
              <div key={index} className="border rounded-lg p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-1.5 text-sm border rounded px-2 py-1.5 hover:bg-accent transition-colors"
                    onClick={() => { setEditingIndex(index); setPickerOpen(true); }}
                  >
                    <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className={setting.product_id ? 'text-foreground truncate' : 'text-muted-foreground'}>
                      {setting.product_id ? getProductName(setting.product_id) : 'اختر منتج'}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeSetting(index)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">صندوق/باليت</span>
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
                        <span className="text-[10px] text-muted-foreground">صندوق/طبقة</span>
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

            <Button variant="outline" size="sm" className="w-full" onClick={addSetting}>
              <Plus className="w-4 h-4 ml-1" />
              إضافة منتج
            </Button>

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حفظ الإعدادات
            </Button>
          </div>
        )}
      </DialogContent>

      <SimpleProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        products={products.map(p => ({ id: p.id, name: p.name }))}
        selectedProductId={editingIndex !== null ? settings[editingIndex]?.product_id || '' : ''}
        onSelect={(productId) => {
          if (editingIndex !== null) {
            updateSetting(editingIndex, 'product_id', productId);
          }
        }}
      />
    </Dialog>
  );
};

export default PalletSettingsDialog;
