import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle, AlertTriangle, Package, Search, Save, TrendingUp, TrendingDown, Minus, ArrowRight, ClipboardCheck, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import WarehouseReviewHistory from '@/components/warehouse/WarehouseReviewHistory';

/** Convert custom format (boxes.pieces) to total pieces */
const customToTotalPieces = (customQty: number, piecesPerBox: number): number => {
  const boxes = Math.floor(Math.round(customQty * 100) / 100);
  const decimalPart = Math.round((Math.round(customQty * 100) / 100 - boxes) * 100);
  return boxes * piecesPerBox + decimalPart;
};

/** Convert total pieces to custom format (boxes.pieces) */
const totalPiecesToCustom = (totalPieces: number, piecesPerBox: number): number => {
  if (totalPieces <= 0) return 0;
  const boxes = Math.floor(totalPieces / piecesPerBox);
  const remainingPieces = Math.round(totalPieces % piecesPerBox);
  return boxes + remainingPieces / 100;
};

interface ReviewItem {
  productId: string;
  productName: string;
  imageUrl?: string | null;
  piecesPerBox: number;
  expected: number;
  actual: string;
  status: 'matched' | 'surplus' | 'deficit' | 'unverified';
}

const fmtQty = (n: number): string => {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toFixed(2);
};

const getActualNum = (actual: string): number => parseFloat(actual) || 0;

const computeStatus = (expected: number, actual: string, piecesPerBox: number): ReviewItem['status'] => {
  if (actual === '') return 'unverified';
  const num = parseFloat(actual) || 0;
  const expectedPieces = customToTotalPieces(expected, piecesPerBox);
  const actualPieces = customToTotalPieces(num, piecesPerBox);
  const diffPieces = actualPieces - expectedPieces;
  if (diffPieces === 0) return 'matched';
  return diffPieces > 0 ? 'surplus' : 'deficit';
};

const WarehouseReview: React.FC = () => {
  const navigate = useNavigate();
  const { workerId } = useAuth();
  const queryClient = useQueryClient();
  const { warehouseStock, isLoading: stockLoading, products, branchId } = useWarehouseStock();

  const [activeTab, setActiveTab] = useState('review');
  const [search, setSearch] = useState('');
  const [includeDamaged, setIncludeDamaged] = useState(false);
  const [includePallets, setIncludePallets] = useState(false);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Pallet quantity
  const { data: palletQuantity = 0 } = useQuery({
    queryKey: ['branch-pallet-qty', branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('branch_pallets')
        .select('quantity')
        .eq('branch_id', branchId!)
        .single();
      return data?.quantity || 0;
    },
    enabled: !!branchId,
  });

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of warehouseStock) {
      map.set(s.product_id, (map.get(s.product_id) ?? 0) + Number(s.quantity || 0));
    }
    return map;
  }, [warehouseStock]);

  // Build a product pieces_per_box lookup
  const piecesPerBoxMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, p.pieces_per_box || 20);
    }
    return map;
  }, [products]);

  // Compute items reactively from products + stock (expected is always fresh)
  const items: ReviewItem[] = useMemo(() => {
    return products.map(product => {
      const expected = stockMap.get(product.id) ?? 0;
      const actual = actuals[product.id] ?? '';
      const ppb = product.pieces_per_box || 20;
      return {
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
        piecesPerBox: ppb,
        expected,
        actual,
        status: computeStatus(expected, actual, ppb),
      };
    });
  }, [products, stockMap, actuals]);

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

  const updateActual = (productId: string, value: string) => {
    setActuals(prev => ({ ...prev, [productId]: value }));
  };

  const markAllMatched = () => {
    const newActuals: Record<string, string> = {};
    for (const product of products) {
      const expected = stockMap.get(product.id) ?? 0;
      newActuals[product.id] = String(expected);
    }
    setActuals(newActuals);
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

  const canSave = stats.unverified === 0 && items.length > 0;

  const handleSave = async () => {
    if (!workerId || !branchId || !canSave) return;
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
        status: item.status as string,
      }));

      if (includeDamaged) {
        for (const d of damagedItems) {
          const actualStr = damagedActuals[d.productId] ?? '';
          const actual = parseFloat(actualStr) || 0;
          const ppb = piecesPerBoxMap.get(d.productId) || 20;
          const expectedPieces = customToTotalPieces(d.expected, ppb);
          const actualPieces = customToTotalPieces(actual, ppb);
          const diffPieces = actualPieces - expectedPieces;
          reviewItems.push({
            session_id: session.id,
            item_type: 'damaged',
            product_id: d.productId,
            expected_quantity: d.expected,
            actual_quantity: actual,
            status: diffPieces === 0 ? 'matched' : diffPieces > 0 ? 'surplus' : 'deficit',
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
      
      // Reset for new review
      setActuals({});
      setActiveTab('history');
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

  if (stockLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const today = new Date().getDay();
  const isReviewDay = [0, 2, 4].includes(today);

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          مراجعة المخزون
        </h2>
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
      </div>

      {/* Review day indicator */}
      {isReviewDay && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 text-center text-sm font-medium text-primary">
          ✅ اليوم يوم مراجعة مخزون
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="review" className="text-xs gap-1">
            <ClipboardCheck className="w-3.5 h-3.5" />
            مراجعة جديدة
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1">
            <History className="w-3.5 h-3.5" />
            السجل
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="space-y-3 mt-3">
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

          {/* Column headers */}
          <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold text-muted-foreground">
            <span>المنتج</span>
            <div className="flex items-center gap-4">
              <span className="w-16 text-center">المتوقع</span>
              <span className="w-14 text-center">سريع</span>
              <span className="w-20 text-center">الفعلي</span>
              <span className="w-8"></span>
            </div>
          </div>

          {/* Product items */}
          <div className="space-y-1.5">
            {filteredItems.map(item => {
              const actualNum = getActualNum(item.actual);
              const expectedPieces = customToTotalPieces(item.expected, item.piecesPerBox);
              const actualPieces = item.actual !== '' ? customToTotalPieces(actualNum, item.piecesPerBox) : 0;
              const diffPieces = item.actual !== '' ? actualPieces - expectedPieces : 0;
              const diffInBoxPiece = diffPieces !== 0 ? totalPiecesToCustom(Math.abs(diffPieces), item.piecesPerBox) : 0;
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
                      <span className="text-sm font-medium truncate">{item.productName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 text-center">
                        <span className="text-sm font-bold text-muted-foreground">{fmtQty(item.expected)}</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => updateActual(item.productId, String(item.expected))}
                        className={`w-14 h-8 text-[11px] px-1 font-bold ${
                          item.status === 'matched'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                        }`}
                      >
                        {item.status === 'matched' ? '✓ مطابق' : 'مطابق'}
                      </Button>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="—"
                        value={item.actual}
                        onChange={e => updateActual(item.productId, e.target.value)}
                        className={`w-20 h-8 text-center text-sm font-bold ${
                          item.status === 'matched' ? 'border-primary/50 bg-primary/5' :
                          item.status === 'deficit' ? 'border-destructive/50 bg-destructive/5' :
                          item.status === 'surplus' ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20' : ''
                        }`}
                      />
                      <div className="w-8 flex justify-center">{getStatusIcon(item.status)}</div>
                    </div>
                  </div>
                  {item.actual !== '' && item.status !== 'matched' && item.status !== 'unverified' && (
                    <div className="mt-1 flex justify-end">
                      {item.status === 'surplus' && <Badge className="bg-amber-500 text-white text-[9px]">فائض: +{fmtQty(diffInBoxPiece)}</Badge>}
                      {item.status === 'deficit' && <Badge variant="destructive" className="text-[9px]">عجز: -{fmtQty(diffInBoxPiece)}</Badge>}
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
                {damagedItems.map(d => (
                  <div key={`damaged-${d.productId}`} className="rounded-lg px-3 py-2 border border-border bg-card flex items-center justify-between mb-1.5">
                    <div>
                      <div className="text-sm font-medium">{d.productName}</div>
                      <div className="text-[10px] text-muted-foreground">المتوقع: {fmtQty(d.expected)}</div>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="—"
                      value={damagedActuals[d.productId] ?? ''}
                      onChange={e => setDamagedActuals(prev => ({ ...prev, [d.productId]: e.target.value }))}
                      className="w-20 h-8 text-center text-sm font-bold"
                    />
                  </div>
                ))}
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

          {/* Save button */}
          <div className="fixed bottom-0 left-0 right-0 bg-background pt-2 pb-3 px-4 border-t z-50">
            {!canSave && items.length > 0 && (
              <p className="text-xs text-muted-foreground text-center mb-1">
                يرجى إدخال الكمية الفعلية لجميع المنتجات ({stats.unverified} متبقي)
              </p>
            )}
            <Button onClick={handleSave} disabled={isSaving || !canSave} className="w-full gap-2" size="default">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              حفظ المراجعة
            </Button>
          </div>
          {/* Spacer for fixed bottom bar */}
          <div className="h-20" />
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          {branchId && <WarehouseReviewHistory branchId={branchId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WarehouseReview;
