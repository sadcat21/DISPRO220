import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Trash2, Loader2, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import SimpleProductPickerDialog from './SimpleProductPickerDialog';

interface DeliveryItem {
  product_id: string;
  product_quantity: number;
  pallet_quantity: number;
}

interface PalletSetting {
  product_id: string;
  boxes_per_pallet: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  products: Product[];
  onSuccess: () => void;
}

const FactoryDeliveryDialog: React.FC<Props> = ({ open, onOpenChange, branchId, products, onSuccess }) => {
  const { workerId } = useAuth();
  const [items, setItems] = useState<DeliveryItem[]>([{ product_id: '', product_quantity: 0, pallet_quantity: 0 }]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [palletSettings, setPalletSettings] = useState<PalletSetting[]>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && branchId) {
      supabase.from('pallet_settings').select('product_id, boxes_per_pallet').eq('branch_id', branchId)
        .then(({ data }) => setPalletSettings(data || []));
    }
  }, [open, branchId]);

  const addItem = () => {
    setItems(prev => [...prev, { product_id: '', product_quantity: 0, pallet_quantity: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof DeliveryItem, value: any) => {
    setItems(prev => {
      const updated = prev.map((item, i) => i === index ? { ...item, [field]: value } : item);
      // Auto-calculate pallets when product_quantity changes
      if (field === 'product_quantity' || field === 'product_id') {
        const item = updated[index];
        const setting = palletSettings.find(s => s.product_id === item.product_id);
        if (setting && setting.boxes_per_pallet > 0 && item.product_quantity > 0) {
          updated[index] = { ...updated[index], pallet_quantity: Math.ceil(item.product_quantity / setting.boxes_per_pallet) };
        }
      }
      return updated;
    });
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && (i.product_quantity > 0 || i.pallet_quantity > 0));
    if (validItems.length === 0) {
      toast.error('أضف منتجات أو باليطات');
      return;
    }

    setIsSaving(true);
    try {
      // Create factory order
      const { data: order, error: orderError } = await supabase
        .from('factory_orders')
        .insert({
          order_type: 'sending',
          branch_id: branchId,
          status: 'confirmed',
          notes,
          created_by: workerId,
          confirmed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert items
      const orderItems = validItems.map(i => ({
        factory_order_id: order.id,
        product_id: i.product_id,
        product_quantity: i.product_quantity,
        pallet_quantity: i.pallet_quantity,
      }));
      const { error: itemsError } = await supabase.from('factory_order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // Deduct damaged products from warehouse stock (factory_return_quantity)
      for (const item of validItems) {
        if (item.product_quantity > 0) {
          const { data: stock } = await supabase
            .from('warehouse_stock')
            .select('id, damaged_quantity, factory_return_quantity')
            .eq('branch_id', branchId)
            .eq('product_id', item.product_id)
            .maybeSingle();

          if (stock) {
            await supabase.from('warehouse_stock').update({
              factory_return_quantity: (Number(stock.factory_return_quantity) || 0) + item.product_quantity,
            }).eq('id', stock.id);
          }
        }
      }

      toast.success('تم تأكيد التسليم للمصنع');
      onOpenChange(false);
      setItems([{ product_id: '', product_quantity: 0, pallet_quantity: 0 }]);
      setNotes('');
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'اختر منتج';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-destructive" />
            تسليم للمصنع
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            حدد المنتجات التالفة والباليطات المراد تسليمها للمصنع. سيتم خصمها من المخزون عند التأكيد.
          </p>

          {items.map((item, index) => (
            <div key={index} className="border rounded-lg p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-1.5 text-sm border rounded px-2 py-1.5 hover:bg-accent transition-colors"
                  onClick={() => { setPickerIndex(index); }}
                >
                  <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className={item.product_id ? 'text-foreground truncate' : 'text-muted-foreground'}>
                    {item.product_id ? getProductName(item.product_id) : 'اختر منتج'}
                  </span>
                </button>
                {items.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(index)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">كمية التالف (صندوق)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={item.product_quantity}
                    onChange={e => updateItem(index, 'product_quantity', parseFloat(e.target.value) || 0)}
                    className="text-center text-sm h-8"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">باليطات</Label>
                  <Input
                    type="number"
                    min={0}
                    value={item.pallet_quantity}
                    onChange={e => updateItem(index, 'pallet_quantity', parseFloat(e.target.value) || 0)}
                    className="text-center text-sm h-8"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة منتج
          </Button>

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="text-right" />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving} className="w-full" variant="destructive">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            تأكيد التسليم للمصنع
          </Button>
        </DialogFooter>
      </DialogContent>

      <SimpleProductPickerDialog
        open={pickerIndex !== null}
        onOpenChange={(open) => { if (!open) setPickerIndex(null); }}
        products={products.map(p => ({ id: p.id, name: p.name }))}
        selectedProductId={pickerIndex !== null ? items[pickerIndex]?.product_id || '' : ''}
        onSelect={(productId) => {
          if (pickerIndex !== null) {
            updateItem(pickerIndex, 'product_id', productId);
          }
        }}
      />
    </Dialog>
  );
};

export default FactoryDeliveryDialog;
