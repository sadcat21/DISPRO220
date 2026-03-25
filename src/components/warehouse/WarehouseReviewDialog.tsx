import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle, Package, Search, Save, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
  actual: string; // empty string = not yet verified
  status: 'matched' | 'surplus' | 'deficit' | 'unverified';
}

const fmtQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const getActualNum = (actual: string): number => parseFloat(actual) || 0;

const computeStatus = (expected: number, actual: string): ReviewItem['status'] => {
  if (actual === '') return 'unverified';
  const num = parseFloat(actual) || 0;
  const diff = num - expected;
  if (Math.abs(diff) < 0.001) return 'matched';
  return diff > 0 ? 'surplus' : 'deficit';
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

  // Initialize items from warehouse stock - actual starts EMPTY (unverified)
  useEffect(() => {
    if (!open) return;
    const reviewItems: ReviewItem[] = [];

    for (const ws of warehouseStock) {
      const product = products.find(p => p.id === ws.product_id);
      if (!product || ws.quantity <= 0) continue;
      reviewItems.push({
        productId: ws.product_id,
        productName: product.name,
        imageUrl: (product as any).image_url,
        itemType: 'product',
        expected: ws.quantity,
        actual: '', // empty = unverified
        status: 'unverified',
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

  const [damagedActuals, setDamagedActuals] = useState<Record<string, string>>({});
  const [palletActual, setPalletActual] = useState('');

  useEffect(() => {
    if (includeDamaged) {
      const actuals: Record<string, string> = {};
      damagedItems.forEach(d => { actuals[d.productId] = ''; });
      setDamagedActuals(actuals);
    }
  }, [includeDamaged, damagedItems.length]);

  useEffect(() => {
    if (includePallets) setPalletActual('');
  }, [includePallets]);

  const updateActual = (productId: string, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.productId !== productId || item.itemType !== 'product') return item;
      return { ...item, actual: value, status: computeStatus(item.expected, value) };
    }));
  };

  const markAllMatched = () => {
    setItems(prev => prev.map(item => ({
      ...item,
      actual: String(item.expected),
      status: 'matched' as const,
    })));
  };

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter(i => i.productName.includes(search));
  }, [items, search]);

  const stats = useMemo(() => {
    let matched = 0, surplus = 0, deficit = 0, unverified = 0;
    for (const item of items) {
      if (item.status === 'matched') matched++;
      else if (item.status === 'surplus') surplus++;
      else if (item.status === 'deficit') deficit++;
      else unverified++;
    }
    return { matched, surplus, deficit, unverified, total: items.length };
  }, [items]);

  const canSave = stats.unverified === 0;

  const handleSave = async () => {
    if (!workerId || !canSave) return;
    setIsSaving(true);
    try {
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

      const reviewItems = items.map(item => ({
        session_id: session.id,
        item_type: 'product',
        product_id: item.productId,
        expected_quantity: item.expected,
        actual_quantity: getActualNum(item.actual),
        status: item.status,
      }));

      if (includeDamaged) {
        for (const d of damagedItems) {
          const actualStr = damagedActuals[d.productId] ?? '';
          const actual = parseFloat(actualStr) || 0;
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

      if (includePallets) {
        const palletNum = parseFloat(palletActual) || 0;
        const diff = palletNum - palletQuantity;
        reviewItems.push({
          session_id: session.id,
          item_type: 'pallet',
          product_id: null as any,
          expected_quantity: palletQuantity,
          actual_quantity: palletNum,
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
            .update({ quantity: getActualNum(item.actual) })
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

  const getStatusIcon = (status: ReviewItem['status']) => {
    switch (status) {
      case 'matched': return <CheckCircle className="w-4 h-4 text-primary shrink-0" />;
      case 'surplus': return <TrendingUp className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'deficit': return <TrendingDown className="w-4 h-4 text-destructive shrink-0" />;
      default: return <Minus className="w-4 h-4 text-muted-foreground shrink-0" />;
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
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{stats.total} منتج</Badge>
          {stats.unverified > 0 && <Badge variant="outline" className="text-[10px] border-muted-foreground/30">{stats.unverified} لم يُراجع</Badge>}
          <Badge className="bg-primary/80 text-primary-foreground text-[10px]">{stats.matched} مطابق</Badge>
          {stats.surplus > 0 && <Badge className="bg-amber-500 text-white text-[10px]">{stats.surplus} فائض</Badge>}
          {stats.deficit > 0 && <Badge variant="destructive" className="text-[10px]">{stats.deficit} عجز</Badge>}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="بحث عن منتج..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
        </div>

        {/* Products - Expected vs Actual layout */}
        <ScrollArea className="max-h-[40vh]">
          <div className="space-y-1.5">
            {/* Column headers */}
            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold text-muted-foreground">
              <span>المنتج</span>
              <div className="flex items-center gap-4">
                <span className="w-16 text-center">المتوقع</span>
                <span className="w-20 text-center">الفعلي</span>
                <span className="w-8"></span>
              </div>
            </div>

            {filteredItems.map(item => {
              const actualNum = getActualNum(item.actual);
              const diff = item.actual !== '' ? actualNum - item.expected : 0;
              return (
                <div key={item.productId} className={`rounded-lg px-3 py-2.5 border ${
                  item.status === 'deficit' ? 'border-destructive/30 bg-destructive/5' :
                  item.status === 'surplus' ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' :
                  item.status === 'unverified' ? 'border-muted-foreground/20 bg-muted/30' :
                  'border-primary/30 bg-primary/5'
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
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Expected - read only */}
                      <div className="w-16 text-center">
                        <span className="text-sm font-bold text-muted-foreground">{fmtQty(item.expected)}</span>
                      </div>
                      {/* Actual - editable */}
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="—"
                        value={item.actual}
                        onChange={e => updateActual(item.productId, e.target.value)}
                        className={`w-20 h-8 text-center text-sm font-bold ${
                          item.status === 'matched' ? 'border-primary/50 bg-primary/5' :
                          item.status === 'deficit' ? 'border-destructive/50 bg-destructive/5' :
                          item.status === 'surplus' ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20' :
                          ''
                        }`}
                      />
                      {/* Status indicator */}
                      <div className="w-8 flex justify-center">
                        {getStatusIcon(item.status)}
                      </div>
                    </div>
                  </div>
                  {/* Difference badge */}
                  {item.actual !== '' && item.status !== 'matched' && item.status !== 'unverified' && (
                    <div className="mt-1 flex justify-end">
                      {item.status === 'surplus' && (
                        <Badge className="bg-amber-500 text-white text-[9px]">فائض: +{fmtQty(diff)}</Badge>
                      )}
                      {item.status === 'deficit' && (
                        <Badge variant="destructive" className="text-[9px]">عجز: -{fmtQty(Math.abs(diff))}</Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Damaged section */}
            {includeDamaged && damagedItems.length > 0 && (
              <div className="pt-2 border-t mt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> التالف ({damagedItems.length})
                </p>
                {damagedItems.map(d => {
                  const actualStr = damagedActuals[d.productId] ?? '';
                  return (
                    <div key={`damaged-${d.productId}`} className="rounded-lg px-3 py-2 border border-border bg-card flex items-center justify-between mb-1.5">
                      <div>
                        <div className="text-sm font-medium">{d.productName}</div>
                        <div className="text-[10px] text-muted-foreground">المتوقع: {fmtQty(d.expected)}</div>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="—"
                        value={actualStr}
                        onChange={e => setDamagedActuals(prev => ({ ...prev, [d.productId]: e.target.value }))}
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
                    placeholder="—"
                    value={palletActual}
                    onChange={e => setPalletActual(e.target.value)}
                    className="w-20 h-8 text-center text-sm font-bold"
                  />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2">
          {!canSave && (
            <p className="text-xs text-muted-foreground text-center">
              يرجى إدخال الكمية الفعلية لجميع المنتجات ({stats.unverified} متبقي)
            </p>
          )}
          <Button onClick={handleSave} disabled={isSaving || !canSave} className="w-full gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ المراجعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WarehouseReviewDialog;
