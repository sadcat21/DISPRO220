import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, Plus, Trash2, Loader2, Package, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface ExchangeItem {
  product_id: string;
  product_name: string;
  damaged_qty: number; // quantity of damaged product (in boxes.pieces format)
  pieces_per_box: number;
}

interface ExchangeSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  branchId: string;
  onComplete?: () => void | Promise<void>;
}

const fmtQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const ExchangeSessionDialog: React.FC<ExchangeSessionDialogProps> = ({
  open, onOpenChange, workerId, workerName, branchId, onComplete,
}) => {
  const queryClient = useQueryClient();
  const { workerId: currentWorkerId } = useAuth();
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string; pieces_per_box: number }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Fetch products
  useEffect(() => {
    if (!open) return;
    setItems([]);
    const fetch = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, pieces_per_box')
        .eq('is_active', true)
        .order('name');
      setProducts(data || []);
    };
    fetch();
  }, [open]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(term));
  }, [products, searchTerm]);

  const addProduct = (product: { id: string; name: string; pieces_per_box: number }) => {
    if (items.find(i => i.product_id === product.id)) {
      toast.error('المنتج مضاف مسبقاً');
      return;
    }
    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      damaged_qty: 0,
      pieces_per_box: product.pieces_per_box,
    }]);
    setShowProductPicker(false);
    setSearchTerm('');
  };

  const updateQty = (productId: string, qty: number) => {
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, damaged_qty: qty } : i));
  };

  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const validItems = items.filter(i => i.damaged_qty > 0);

  const handleConfirm = async () => {
    if (validItems.length === 0) {
      toast.error('يرجى إضافة منتج واحد على الأقل مع كمية');
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Create exchange session
      const { data: session, error: sessionError } = await supabase
        .from('loading_sessions')
        .insert({
          worker_id: workerId,
          manager_id: currentWorkerId!,
          branch_id: branchId,
          status: 'exchange',
          notes: `جلسة استبدال تالف - ${validItems.length} منتج`,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (sessionError) throw sessionError;

      // 2. For each item: deduct from warehouse, add to damaged, record session item
      for (const item of validItems) {
        // Save session item
        await supabase.from('loading_session_items').insert({
          session_id: session.id,
          product_id: item.product_id,
          quantity: item.damaged_qty,
          gift_quantity: 0,
          gift_unit: 'piece',
          surplus_quantity: 0,
          is_custom_load: false,
          notes: `استبدال تالف: ${fmtQty(item.damaged_qty)}`,
        });

        // Deduct from warehouse stock (giving a good product)
        const { data: whStock } = await supabase
          .from('warehouse_stock')
          .select('id, quantity, damaged_quantity')
          .eq('branch_id', branchId)
          .eq('product_id', item.product_id)
          .maybeSingle();

        if (whStock) {
          const newQty = Math.max(0, whStock.quantity - item.damaged_qty);
          const newDamaged = (whStock.damaged_quantity || 0) + item.damaged_qty;
          await supabase
            .from('warehouse_stock')
            .update({ quantity: newQty, damaged_quantity: newDamaged })
            .eq('id', whStock.id);
        } else {
          // No warehouse stock exists - create with 0 qty and damaged count
          await supabase.from('warehouse_stock').insert({
            branch_id: branchId,
            product_id: item.product_id,
            quantity: 0,
            damaged_quantity: item.damaged_qty,
          });
        }

        // Record stock movement
        await supabase.from('stock_movements').insert({
          product_id: item.product_id,
          branch_id: branchId,
          quantity: item.damaged_qty,
          movement_type: 'exchange',
          status: 'approved',
          created_by: currentWorkerId,
          worker_id: workerId,
          notes: `استبدال تالف - ${item.product_name}`,
        });
      }

      // 3. Invalidate caches
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['loading-sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] }),
        queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] }),
        queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] }),
      ]);

      toast.success(`تم تسجيل استبدال ${validItems.length} منتج تالف بنجاح`);
      onOpenChange(false);
      await onComplete?.();
    } catch (err: any) {
      toast.error(err.message || 'خطأ في تسجيل الاستبدال');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            جلسة استبدال تالف
          </DialogTitle>
          <DialogDescription>
            استبدال منتجات تالفة بمنتجات سليمة للعامل: <strong>{workerName}</strong>
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            رصيد الشاحنة لن يتغير — سيتم خصم من مخزون الفرع وإضافة للتالف
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="space-y-3 p-1">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">اضغط "إضافة منتج" لتحديد المنتجات التالفة</p>
              </div>
            ) : items.map(item => (
              <Card key={item.product_id} className="border">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{item.product_name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => removeItem(item.product_id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">كمية التالف:</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.damaged_qty || ''}
                      onFocus={e => e.target.select()}
                      onChange={e => updateQty(item.product_id, parseFloat(e.target.value) || 0)}
                      className="h-8 text-center flex-1"
                      placeholder="مثال: 1 أو 0.01"
                    />
                  </div>
                  {item.damaged_qty > 0 && (
                    <div className="text-xs text-muted-foreground bg-orange-50 dark:bg-orange-900/10 rounded px-2 py-1">
                      سيتم خصم <strong>{fmtQty(item.damaged_qty)}</strong> من المخزن وإضافتها كتالف
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        {/* Product picker inline */}
        {showProductPicker && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث عن منتج..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="sm" className="h-8" onClick={() => { setShowProductPicker(false); setSearchTerm(''); }}>
                إلغاء
              </Button>
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1">
                {filteredProducts.slice(0, 20).map(p => (
                  <Button
                    key={p.id}
                    variant="ghost"
                    className="w-full justify-start h-8 text-sm"
                    onClick={() => addProduct(p)}
                    disabled={!!items.find(i => i.product_id === p.id)}
                  >
                    <Package className="w-3.5 h-3.5 me-2 text-primary" />
                    {p.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Summary */}
        {validItems.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-lg p-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-orange-700 dark:text-orange-400">إجمالي الاستبدال</span>
              <Badge className="bg-orange-500 text-white">{validItems.length} منتج</Badge>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-col">
          {!showProductPicker && (
            <Button variant="outline" onClick={() => setShowProductPicker(true)} className="w-full">
              <Plus className="w-4 h-4 me-1" />
              إضافة منتج
            </Button>
          )}
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              إلغاء
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting || validItems.length === 0}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <RefreshCw className="w-4 h-4 me-1" />
              تأكيد الاستبدال
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExchangeSessionDialog;
