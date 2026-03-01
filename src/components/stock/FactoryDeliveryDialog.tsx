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
  const [items, setItems] = useState<DeliveryItem[]>([{ product_id: '', product_quantity: 0 }]);
  const [palletQuantity, setPalletQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [currentPallets, setCurrentPallets] = useState(0);

  useEffect(() => {
    if (open && branchId) {
      supabase.from('branch_pallets').select('quantity').eq('branch_id', branchId).maybeSingle()
        .then(({ data }) => setCurrentPallets(data?.quantity || 0));
    }
  }, [open, branchId]);

  const addItem = () => {
    setItems(prev => [...prev, { product_id: '', product_quantity: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof DeliveryItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && i.product_quantity > 0);
    if (validItems.length === 0 && palletQuantity === 0) {
      toast.error('أضف منتجات تالفة أو باليطات');
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

      // Insert product items (damaged)
      if (validItems.length > 0) {
        const orderItems = validItems.map(i => ({
          factory_order_id: order.id,
          product_id: i.product_id,
          product_quantity: i.product_quantity,
          pallet_quantity: 0,
        }));
        const { error: itemsError } = await supabase.from('factory_order_items').insert(orderItems);
        if (itemsError) throw itemsError;

        // Update factory_return_quantity on warehouse_stock
        for (const item of validItems) {
          if (item.product_quantity > 0) {
            const { data: stock } = await supabase
              .from('warehouse_stock')
              .select('id, factory_return_quantity')
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
      }

      // Deduct pallets from branch balance
      if (palletQuantity > 0) {
        // Also store pallet_quantity on the order for reference (use first item or create a dummy)
        if (validItems.length === 0) {
          // Create a placeholder item for pallet-only delivery
          await supabase.from('factory_order_items').insert({
            factory_order_id: order.id,
            product_id: products[0]?.id || branchId, // fallback
            product_quantity: 0,
            pallet_quantity: palletQuantity,
          });
        }

        const { data: bp } = await supabase
          .from('branch_pallets')
          .select('id, quantity')
          .eq('branch_id', branchId)
          .maybeSingle();

        if (bp) {
          await supabase.from('branch_pallets').update({
            quantity: Math.max(0, bp.quantity - palletQuantity),
          }).eq('id', bp.id);
        }

        // Log movement
        await supabase.from('pallet_movements').insert({
          branch_id: branchId,
          quantity: -palletQuantity,
          movement_type: 'delivery',
          reference_id: order.id,
          notes: `تسليم باليطات للمصنع`,
          created_by: workerId,
        });
      }

      toast.success('تم تأكيد التسليم للمصنع');
      onOpenChange(false);
      setItems([{ product_id: '', product_quantity: 0 }]);
      setPalletQuantity(0);
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
            حدد المنتجات التالفة وعدد الباليطات المراد تسليمها للمصنع.
          </p>

          {/* Independent Pallet Field */}
          <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 space-y-1.5">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              🪵 باليطات للتسليم
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                value={palletQuantity}
                onChange={e => setPalletQuantity(parseInt(e.target.value) || 0)}
                className="text-center text-sm h-9 w-28"
              />
              <span className="text-xs text-muted-foreground">
                الرصيد الحالي: <span className="font-bold text-foreground">{currentPallets}</span>
              </span>
            </div>
          </div>

          {/* Damaged Products */}
          <Label className="text-xs font-semibold text-muted-foreground">المنتجات التالفة</Label>
          {items.map((item, index) => (
            <div key={index} className="border rounded-lg p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-1.5 text-sm border rounded px-2 py-1.5 hover:bg-accent transition-colors"
                  onClick={() => setPickerIndex(index)}
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
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة منتج تالف
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
