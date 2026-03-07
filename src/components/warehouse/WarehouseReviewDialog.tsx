import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle, Package, Search, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface WarehouseReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  products: { id: string; name: string; image_url?: string | null }[];
  warehouseStock: { product_id: string; quantity: number; damaged_quantity?: number }[];
  palletQuantity?: number;
}

interface ReviewItem {
  productId: string;
  productName: string;
  imageUrl?: string | null;
  itemType: 'product' | 'damaged' | 'pallet';
  expected: number;
  actual: number;
  status: 'matched' | 'surplus' | 'deficit' | 'unverified';
}

const fmtQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const WarehouseReviewDialog: React.FC<WarehouseReviewDialogProps> = ({
  open, onOpenChange, branchId, products, warehouseStock, palletQuantity = 0,
}) => {
  const { workerId } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeDamaged, setIncludeDamaged] = useState(false);
  const [includePallets, setIncludePallets] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize items from warehouse stock
  useEffect(() => {
    if (!open) return;
    const reviewItems: ReviewItem[] = [];

    // Products
    for (const ws of warehouseStock) {
      const product = products.find(p => p.id === ws.product_id);
      if (!product || ws.quantity <= 0) continue;
      reviewItems.push({
        productId: ws.product_id,
        productName: product.name,
        imageUrl: (product as any).image_url,
        itemType: 'product',
        expected: ws.quantity,
        actual: ws.quantity, // default to matched
        status: 'matched',
      });
    }

    setItems(reviewItems);
  }, [open, warehouseStock, products]);

  // Damaged items
  const damagedItems = useMemo(() => {
    if (!includeDamaged) return [];
    return warehouseStock
      .filter(ws => (ws as any).damaged_quantity > 0)
      .map(ws => {
        const product = products.find(p => p.id === ws.product_id);
        return {
          productId: ws.product_id,
          productName: product?.name || '—',
          expected: (ws as any).damaged_quantity || 0,
        };
      });
  }, [includeDamaged, warehouseStock, products]);

  const [damagedActuals, setDamagedActuals] = useState<Record<string, number>>({});
  const [palletActual, setPalletActual] = useState(palletQuantity);

  useEffect(() => {
    if (includeDamaged) {
      const actuals: Record<string, number> = {};
      damagedItems.forEach(d => { actuals[d.productId] = d.expected; });
      setDamagedActuals(actuals);
    }
  }, [includeDamaged, damagedItems.length]);

  useEffect(() => {
    if (includePallets) setPalletActual(palletQuantity);
  }, [includePallets, palletQuantity]);

  const updateActual = (productId: string, value: string) => {
    const num = parseFloat(value) || 0;
    setItems(prev => prev.map(item => {
      if (item.productId !== productId || item.itemType !== 'product') return item;
      const diff = num - item.expected;
      let status: ReviewItem['status'] = 'matched';
      if (Math.abs(diff) > 0.001) status = diff > 0 ? 'surplus' : 'deficit';
      return { ...item, actual: num, status };
    }));
  };

  const markAllMatched = () => {
    setItems(prev => prev.map(item => ({ ...item, actual: item.expected, status: 'matched' as const })));
  };

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter(i => i.productName.includes(search));
  }, [items, search]);

  const stats = useMemo(() => {
    let matched = 0, surplus = 0, deficit = 0;
    for (const item of items) {
      if (item.status === 'matched') matched++;
      else if (item.status === 'surplus') surplus++;
      else if (item.status === 'deficit') deficit++;
    }
    return { matched, surplus, deficit, total: items.length };
  }, [items]);

  const handleSave = async () => {
    if (!workerId) return;
    setIsSaving(true);
    try {
      // Create session
      const { data: session, error: sessionError } = await supabase
        .from('warehouse_review_sessions')
        .insert({
          branch_id: branchId,
          reviewer_id: workerId,
          status: 'completed',
          include_damaged: includeDamaged,
          include_pallets: includePallets,
          total_products: items.length,
          total_discrepancies: stats.surplus + stats.deficit,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Insert product items
      const reviewItems = items.map(item => ({
        session_id: session.id,
        item_type: 'product',
        product_id: item.productId,
        expected_quantity: item.expected,
        actual_quantity: item.actual,
        status: item.status,
      }));

      // Add damaged items
      if (includeDamaged) {
        for (const d of damagedItems) {
          const actual = damagedActuals[d.productId] ?? d.expected;
          const diff = actual - d.expected;
          reviewItems.push({
            session_id: session.id,
            item_type: 'damaged',
            product_id: d.productId,
            expected_quantity: d.expected,
            actual_quantity: actual,
            status: Math.abs(diff) < 0.001 ? 'matched' : diff > 0 ? 'surplus' : 'deficit',
          });
        }
      }

      // Add pallet item
      if (includePallets) {
        const diff = palletActual - palletQuantity;
        reviewItems.push({
          session_id: session.id,
          item_type: 'pallet',
          product_id: null as any,
          expected_quantity: palletQuantity,
          actual_quantity: palletActual,
          status: Math.abs(diff) < 0.001 ? 'matched' : diff > 0 ? 'surplus' : 'deficit',
        });
      }

      if (reviewItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('warehouse_review_items')
          .insert(reviewItems);
        if (itemsError) throw itemsError;
      }

      // Update warehouse stock for discrepancies
      for (const item of items) {
        if (item.status !== 'matched') {
          await supabase
            .from('warehouse_stock')
            .update({ quantity: item.actual })
            .eq('branch_id', branchId)
            .eq('product_id', item.productId);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['warehouse-review-history'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-product-summary'] });
      toast.success(`تم حفظ المراجعة: ${stats.matched} مطابق، ${stats.surplus} فائض، ${stats.deficit} عجز`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'خطأ في حفظ المراجعة');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            مراجعة مخزون الفرع
          </DialogTitle>
        </DialogHeader>

        {/* Options */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="include-damaged" checked={includeDamaged} onCheckedChange={setIncludeDamaged} />
            <Label htmlFor="include-damaged" className="text-xs">مراجعة التالف</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="include-pallets" checked={includePallets} onCheckedChange={setIncludePallets} />
            <Label htmlFor="include-pallets" className="text-xs">مراجعة الباليطات</Label>
          </div>
          <Button size="sm" variant="ghost" className="text-xs ms-auto" onClick={markAllMatched}>
            <CheckCircle className="w-3.5 h-3.5 me-1" />
            تطابق الكل
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-[10px]">{stats.total} منتج</Badge>
          <Badge className="bg-primary/80 text-primary-foreground text-[10px]">{stats.matched} مطابق</Badge>
          {stats.surplus > 0 && <Badge className="bg-amber-500 text-white text-[10px]">{stats.surplus} فائض</Badge>}
          {stats.deficit > 0 && <Badge variant="destructive" className="text-[10px]">{stats.deficit} عجز</Badge>}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="بحث عن منتج..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
        </div>

        {/* Products */}
        <ScrollArea className="max-h-[40vh]">
          <div className="space-y-1.5">
            {filteredItems.map(item => (
              <div key={item.productId} className={`rounded-lg px-3 py-2.5 border ${
                item.status === 'deficit' ? 'border-destructive/30 bg-destructive/5' :
                item.status === 'surplus' ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' :
                'border-border bg-card'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.productName}</div>
                      <div className="text-[10px] text-muted-foreground">المتوقع: {fmtQty(item.expected)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.actual}
                      onChange={e => updateActual(item.productId, e.target.value)}
                      className="w-20 h-8 text-center text-sm font-bold"
                    />
                    {item.status === 'matched' && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                    {item.status === 'surplus' && <Badge className="bg-amber-500 text-white text-[9px] shrink-0">+{fmtQty(item.actual - item.expected)}</Badge>}
                    {item.status === 'deficit' && <Badge variant="destructive" className="text-[9px] shrink-0">-{fmtQty(item.expected - item.actual)}</Badge>}
                  </div>
                </div>
              </div>
            ))}

            {/* Damaged section */}
            {includeDamaged && damagedItems.length > 0 && (
              <div className="pt-2 border-t mt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> التالف ({damagedItems.length})
                </p>
                {damagedItems.map(d => {
                  const actual = damagedActuals[d.productId] ?? d.expected;
                  const diff = actual - d.expected;
                  return (
                    <div key={`damaged-${d.productId}`} className="rounded-lg px-3 py-2 border border-border bg-card flex items-center justify-between mb-1.5">
                      <div>
                        <div className="text-sm font-medium">{d.productName}</div>
                        <div className="text-[10px] text-muted-foreground">المتوقع: {fmtQty(d.expected)}</div>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        value={actual}
                        onChange={e => setDamagedActuals(prev => ({ ...prev, [d.productId]: parseFloat(e.target.value) || 0 }))}
                        className="w-20 h-8 text-center text-sm font-bold"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pallet section */}
            {includePallets && (
              <div className="pt-2 border-t mt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">🪵 الباليطات</p>
                <div className="rounded-lg px-3 py-2 border border-border bg-card flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">رصيد الباليطات</div>
                    <div className="text-[10px] text-muted-foreground">المتوقع: {palletQuantity}</div>
                  </div>
                  <Input
                    type="number"
                    value={palletActual}
                    onChange={e => setPalletActual(parseInt(e.target.value) || 0)}
                    className="w-20 h-8 text-center text-sm font-bold"
                  />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ المراجعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WarehouseReviewDialog;
