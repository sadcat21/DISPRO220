import React, { useState, useEffect, useMemo } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Loader2, Trash2, Truck, AlertTriangle, Package, CheckCircle, PackageX, User, ChevronDown, Gift, Save, History, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import WorkerPickerDialog from '@/components/stock/WorkerPickerDialog';
import ProductPickerDialog from '@/components/stock/ProductPickerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useWorkerLoadSuggestions, useStockAlerts } from '@/hooks/useStockAlerts';
import { useLoadingSessions } from '@/hooks/useLoadingSessions';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface EmptyTruckItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  pendingNeeded: number;
  returnQty: number;
  keepAllocations: { reason: string; quantity: number }[];
  allocationMode: boolean;
}

const KEEP_REASONS = ['cash_sale', 'offer_gifts', 'reserve', 'other'] as const;
/** Format quantity: show up to 2 decimal places, strip trailing zeros */
const fmtQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const LoadStock: React.FC = () => {
  const { t } = useLanguage();
  const { workerId: currentWorkerId } = useAuth();
  const queryClient = useQueryClient();
  const { warehouseStock, workers, products, loadToWorker, isLoading, branchId, refresh } = useWarehouseStock();

  const { workerId: contextWorkerId } = useSelectedWorker();
  const [selectedWorker, setSelectedWorker] = useState(() => contextWorkerId || '');
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [emptyTruckItems, setEmptyTruckItems] = useState<EmptyTruckItem[]>([]);
  const [isEmptying, setIsEmptying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Add product dialog state
  const [addProductId, setAddProductId] = useState('');
  const [addProductQty, setAddProductQty] = useState(1);
  const [addProductGiftQty, setAddProductGiftQty] = useState(0);
  const [addProductGiftUnit, setAddProductGiftUnit] = useState('piece');

  // Current session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<any[]>([]);

  const { data: stockAlerts = [] } = useStockAlerts();
  const { data: suggestions = [], isLoading: suggestionsLoading } = useWorkerLoadSuggestions(selectedWorker || null);
  const {
    sessions, createSession, addSessionItem, completeSession, deleteSession,
    deleteSessionItem, sessionItemsQuery, refetch: refetchSessions,
  } = useLoadingSessions(selectedWorker || null);

  // Product offers cache (with all tiers for dynamic calc)
  const [productOffers, setProductOffers] = useState<Record<string, { offerName: string; giftQty: number; giftUnit: string; minQty: number; minUnit: string; tiers: { minQty: number; maxQty: number | null; giftQty: number; giftUnit: string }[] }>>({});

  // Product group map
  const [productGroupMap, setProductGroupMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const fetchGroups = async () => {
      const { data: mappings } = await supabase
        .from('product_pricing_groups')
        .select('product_id, group:pricing_groups(name)');
      if (mappings) {
        const map: Record<string, string> = {};
        for (const m of mappings) map[m.product_id] = (m.group as any)?.name || '';
        setProductGroupMap(map);
      }
    };
    fetchGroups();
  }, []);

  const allProductOptions = useMemo(() => {
    const options: { id: string; name: string; warehouseQty: number; groupName?: string }[] = [];
    const seenIds = new Set<string>();
    for (const s of warehouseStock) {
      if (s.product) {
        options.push({ id: s.product_id, name: s.product.name, warehouseQty: s.quantity, groupName: productGroupMap[s.product_id] });
        seenIds.add(s.product_id);
      }
    }
    for (const p of products) {
      if (!seenIds.has(p.id)) {
        options.push({ id: p.id, name: p.name, warehouseQty: 0, groupName: productGroupMap[p.id] });
        seenIds.add(p.id);
      }
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [warehouseStock, products, productGroupMap]);

  // Reset on worker change
  useEffect(() => {
    setActiveSessionId(null);
    setSessionItems([]);
  }, [selectedWorker]);

  // Load active session items
  useEffect(() => {
    if (!activeSessionId) { setSessionItems([]); return; }
    const load = async () => {
      const { data } = await sessionItemsQuery(activeSessionId);
      setSessionItems(data || []);
    };
    load();
  }, [activeSessionId]);

  // Auto-create or resume open session when worker selected
  useEffect(() => {
    if (selectedWorker && sessions.length > 0) {
      const openSession = sessions.find(s => s.status === 'open');
      if (openSession) setActiveSessionId(openSession.id);
    }
  }, [selectedWorker, sessions]);

  const getAvailableQuantity = (productId: string) =>
    warehouseStock.find(s => s.product_id === productId)?.quantity || 0;

  const fetchProductOffer = async (productId: string) => {
    if (productOffers[productId]) return productOffers[productId];
    const { data: offers } = await supabase
      .from('product_offers')
      .select('id, name')
      .eq('product_id', productId)
      .eq('is_active', true)
      .limit(1);
    if (!offers || offers.length === 0) return null;
    const { data: tiers } = await supabase
      .from('product_offer_tiers')
      .select('min_quantity, max_quantity, min_quantity_unit, gift_quantity, gift_quantity_unit, gift_type')
      .eq('offer_id', offers[0].id)
      .eq('gift_type', 'same_product')
      .order('tier_order', { ascending: true });
    if (!tiers || tiers.length === 0) return null;
    const firstTier = tiers[0];
    const offer = {
      offerName: offers[0].name,
      giftQty: firstTier.gift_quantity,
      giftUnit: firstTier.gift_quantity_unit || 'piece',
      minQty: firstTier.min_quantity,
      minUnit: firstTier.min_quantity_unit || 'piece',
      tiers: tiers.map(t => ({
        minQty: t.min_quantity,
        maxQty: t.max_quantity,
        giftQty: t.gift_quantity,
        giftUnit: t.gift_quantity_unit || 'piece',
      })),
    };
    setProductOffers(prev => ({ ...prev, [productId]: offer }));
    return offer;
  };

  // Auto-calculate gift quantity when product qty changes
  useEffect(() => {
    if (!addProductId || addProductQty <= 0) return;
    const offer = productOffers[addProductId];
    if (!offer) { setAddProductGiftQty(0); return; }

    // Find the matching tier for the entered quantity
    let totalGifts = 0;
    const qty = addProductQty;

    // Check tiers from highest to lowest
    const sortedTiers = [...offer.tiers].sort((a, b) => b.minQty - a.minQty);
    for (const tier of sortedTiers) {
      if (qty >= tier.minQty) {
        totalGifts = Math.floor(qty / tier.minQty) * tier.giftQty;
        setAddProductGiftUnit(tier.giftUnit);
        break;
      }
    }
    setAddProductGiftQty(totalGifts);
  }, [addProductQty, addProductId, productOffers]);

  // Start new session
  const handleStartSession = async () => {
    if (!selectedWorker) { toast.error(t('stock.select_worker')); return; }
    try {
      const result = await createSession.mutateAsync({ workerId: selectedWorker });
      setActiveSessionId(result.id);
      toast.success('تم بدء جلسة شحن جديدة');
    } catch (err: any) { toast.error(err.message); }
  };

  // Open add product dialog
  const handleOpenAddProduct = () => {
    setAddProductId('');
    setAddProductQty(1);
    setAddProductGiftQty(0);
    setAddProductGiftUnit('piece');
    setShowProductPicker(true);
  };

  // When product selected from picker
  const handleProductSelected = async (productId: string) => {
    setAddProductId(productId);
    setShowProductPicker(false);

    // Auto-fill suggested quantity
    const suggestion = suggestions.find(s => s.product_id === productId);
    if (suggestion && suggestion.suggested_load > 0) {
      setAddProductQty(suggestion.suggested_load);
    } else {
      setAddProductQty(1);
    }

    // Fetch offer data (gift calc is handled by useEffect)
    await fetchProductOffer(productId);

    setShowAddProductDialog(true);
  };

  // Confirm add single product to session
  const handleAddProductToSession = async () => {
    if (!activeSessionId || !addProductId || addProductQty <= 0) return;
    setIsSaving(true);
    try {
      const product = products.find(p => p.id === addProductId);
      let totalLoadQty = addProductQty;

      // Convert gift to box units if needed
      if (addProductGiftQty > 0) {
        const piecesPerBox = product?.pieces_per_box || 1;
        const giftBoxes = addProductGiftUnit === 'piece' ? addProductGiftQty / piecesPerBox : addProductGiftQty;
        totalLoadQty += giftBoxes;
      }

      // Direct stock operations without full reload
      const warehouseItem = warehouseStock.find(s => s.product_id === addProductId);
      if (!warehouseItem || warehouseItem.quantity < totalLoadQty) {
        throw new Error(`الكمية المتاحة من ${product?.name || ''} غير كافية`);
      }

      // Deduct from warehouse
      await supabase
        .from('warehouse_stock')
        .update({ quantity: warehouseItem.quantity - totalLoadQty })
        .eq('id', warehouseItem.id);

      // Add to worker stock
      const { data: existingWS } = await supabase
        .from('worker_stock')
        .select('id, quantity')
        .eq('worker_id', selectedWorker)
        .eq('product_id', addProductId)
        .maybeSingle();

      if (existingWS) {
        await supabase
          .from('worker_stock')
          .update({ quantity: existingWS.quantity + totalLoadQty })
          .eq('id', existingWS.id);
      } else {
        await supabase.from('worker_stock').insert({
          worker_id: selectedWorker,
          product_id: addProductId,
          branch_id: branchId,
          quantity: totalLoadQty,
        });
      }

      // Movement record
      await supabase.from('stock_movements').insert({
        product_id: addProductId,
        branch_id: branchId,
        quantity: totalLoadQty,
        movement_type: 'load',
        status: 'approved',
        created_by: currentWorkerId,
        worker_id: selectedWorker,
        notes: `شحن من جلسة - ${product?.name || ''}`,
      });

      // Save to session
      await addSessionItem.mutateAsync({
        sessionId: activeSessionId,
        productId: addProductId,
        quantity: addProductQty,
        giftQuantity: addProductGiftQty,
        giftUnit: addProductGiftUnit,
        notes: product?.name || '',
      });

      // Refresh session items only
      const { data } = await sessionItemsQuery(activeSessionId);
      setSessionItems(data || []);

      // Targeted invalidation - realtime handles warehouse/worker stock
      queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });

      toast.success(`تم شحن ${product?.name || ''} بنجاح`);
      setShowAddProductDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Remove item from session (reverse stock)
  const handleRemoveSessionItem = async (item: any) => {
    try {
      await deleteSessionItem.mutateAsync({
        itemId: item.id,
        productId: item.product_id,
        quantity: item.quantity,
        giftQuantity: item.gift_quantity || 0,
      });
      const { data } = await sessionItemsQuery(activeSessionId!);
      setSessionItems(data || []);
      await refresh();
      toast.success('تم حذف المنتج واسترجاع الرصيد');
    } catch (err: any) { toast.error(err.message); }
  };

  // Complete session
  const handleCompleteSession = async () => {
    if (!activeSessionId) return;
    try {
      await completeSession.mutateAsync(activeSessionId);
      toast.success('تم تأكيد جلسة الشحن بنجاح');
      setActiveSessionId(null);
      setSessionItems([]);
    } catch (err: any) { toast.error(err.message); }
  };

  // Delete entire session (reverse all stock)
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession.mutateAsync(sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setSessionItems([]);
      }
      await refresh();
      toast.success('تم حذف الجلسة واسترجاع الرصيد');
    } catch (err: any) { toast.error(err.message); }
  };

  const hasDeficit = suggestions.some(s => s.suggested_load > 0);
  const totalDeficit = suggestions.reduce((sum, s) => sum + s.suggested_load, 0);
  const totalSessionQty = sessionItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalSessionGifts = sessionItems.reduce((s, i) => s + (i.gift_quantity || 0), 0);

  // Empty truck handler
  const handleEmptyTruckPreview = async () => {
    if (!selectedWorker || !branchId || !currentWorkerId) return;
    const { data: workerStock } = await supabase
      .from('worker_stock')
      .select('id, product_id, quantity, product:products(name)')
      .eq('worker_id', selectedWorker)
      .gt('quantity', 0);
    if (!workerStock || workerStock.length === 0) { toast.error(t('stock.empty_truck_nothing')); return; }
    const { data: orders } = await supabase
      .from('orders')
      .select('order_items:order_items(product_id, quantity)')
      .eq('assigned_worker_id', selectedWorker)
      .in('status', ['assigned', 'in_progress']);
    const pendingQty: Record<string, number> = {};
    for (const order of orders || []) {
      for (const item of (order as any).order_items || []) {
        pendingQty[item.product_id] = (pendingQty[item.product_id] || 0) + item.quantity;
      }
    }
    const itemsToReturn = workerStock
      .map(ws => ({
        id: ws.id, product_id: ws.product_id,
        product_name: (ws.product as any)?.name || ws.product_id,
        quantity: ws.quantity, pendingNeeded: pendingQty[ws.product_id] || 0,
        returnQty: Math.max(0, ws.quantity - (pendingQty[ws.product_id] || 0)),
        keepAllocations: [] as { reason: string; quantity: number }[], allocationMode: false,
      }))
      .filter(ws => (ws.quantity - ws.pendingNeeded) > 0);
    if (itemsToReturn.length === 0) { toast.error(t('stock.empty_truck_nothing')); return; }
    setEmptyTruckItems(itemsToReturn);
    setShowEmptyDialog(true);
  };

  const handleEmptyTruckConfirm = async () => {
    if (!branchId || !currentWorkerId) return;
    setIsEmptying(true);
    setShowEmptyDialog(false);
    try {
      for (const item of emptyTruckItems) {
        if (item.returnQty <= 0) continue;
        await supabase.from('worker_stock').update({ quantity: item.quantity - item.returnQty }).eq('id', item.id);
        const existingWarehouse = warehouseStock.find(s => s.product_id === item.product_id);
        if (existingWarehouse) {
          await supabase.from('warehouse_stock').update({ quantity: existingWarehouse.quantity + item.returnQty }).eq('id', existingWarehouse.id);
        } else {
          await supabase.from('warehouse_stock').insert({ branch_id: branchId, product_id: item.product_id, quantity: item.returnQty });
        }
        await supabase.from('stock_movements').insert({
          product_id: item.product_id, branch_id: branchId, quantity: item.returnQty,
          movement_type: 'return', status: 'approved', created_by: currentWorkerId,
          worker_id: selectedWorker, notes: `تفريغ الشاحنة - إرجاع ${item.returnQty} من ${item.product_name}`,
        });
      }
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      toast.success(t('stock.empty_truck_success'));
    } catch (error: any) { toast.error(error.message); }
    finally { setIsEmptying(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!branchId) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">{t('stock.load_to_worker')}</h2>
        <Card><CardContent className="py-6 text-center text-muted-foreground">{t('branches.select_branch')}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="p-4 pb-2 space-y-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          {t('stock.load_to_worker')}
        </h2>

        {/* Worker Selection */}
        <Button variant="outline" className="w-full justify-between h-11" onClick={() => setShowWorkerPicker(true)}>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span>{selectedWorker ? workers.find(w => w.id === selectedWorker)?.full_name : t('stock.select_worker')}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>

        {/* Stock Summary Collapsible */}
        {selectedWorker && !suggestionsLoading && suggestions.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasDeficit ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <CheckCircle className="w-4 h-4 text-primary" />}
                  <span className="font-semibold text-sm">{hasDeficit ? t('stock.needs_loading') : t('stock.stock_sufficient')}</span>
                  {hasDeficit && <Badge variant="destructive" className="text-xs">{totalDeficit} {t('stock.boxes')}</Badge>}
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid gap-2 max-h-[30vh] overflow-y-auto">
                {suggestions.map(s => {
                  const sessionLoad = sessionItems.filter(si => si.product_id === s.product_id);
                  const loadedThisSession = sessionLoad.reduce((sum: number, si: any) => sum + (si.quantity || 0), 0);
                  const giftQty = sessionLoad.reduce((sum: number, si: any) => sum + (si.gift_quantity || 0), 0);
                  const oldStock = s.current_stock - loadedThisSession;
                  const surplus = Math.max(0, s.current_stock - s.pending_orders_quantity);
                  return (
                    <Card key={s.product_id} className="border">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-sm">{s.product_name}</span>
                          </div>
                          {s.suggested_load > 0 ? (
                            <Badge variant="destructive" className="text-xs">يحتاج +{fmtQty(s.suggested_load)}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-primary/30 text-primary">✓ كافي</Badge>
                          )}
                        </div>
                        <div className={`grid ${giftQty > 0 ? 'grid-cols-6' : 'grid-cols-5'} gap-1 text-xs`}>
                          <div className="bg-muted/50 rounded p-1 text-center">
                            <div className="text-muted-foreground text-[10px]">سابق</div>
                            <div className="font-bold">{fmtQty(oldStock)}</div>
                          </div>
                          <div className="bg-primary/5 rounded p-1 text-center">
                            <div className="text-muted-foreground text-[10px]">جديد</div>
                            <div className="font-bold text-primary">{loadedThisSession > 0 ? `+${fmtQty(loadedThisSession)}` : '—'}</div>
                          </div>
                          <div className="bg-muted/50 rounded p-1 text-center">
                            <div className="text-muted-foreground text-[10px]">الكلي</div>
                            <div className="font-bold">{fmtQty(s.current_stock)}</div>
                          </div>
                          <div className="bg-muted/50 rounded p-1 text-center">
                            <div className="text-muted-foreground text-[10px]">طلبات</div>
                            <div className="font-bold">{fmtQty(s.pending_orders_quantity)}</div>
                          </div>
                          <div className="bg-muted/50 rounded p-1 text-center">
                            <div className="text-muted-foreground text-[10px]">فائض</div>
                            <div className="font-bold">{fmtQty(surplus)}</div>
                          </div>
                          {giftQty > 0 && (
                            <div className="bg-destructive/5 rounded p-1 text-center">
                              <div className="text-muted-foreground text-[10px]">هدايا</div>
                              <div className="font-bold text-destructive">{fmtQty(giftQty)}</div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {suggestionsLoading && selectedWorker && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}

        {/* Session Status */}
        {activeSessionId && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-2">
            <div className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-primary" />
              <span className="font-medium">جلسة شحن نشطة</span>
              <Badge variant="secondary">{sessionItems.length} منتج</Badge>
              {totalSessionQty > 0 && <Badge>{totalSessionQty} صندوق</Badge>}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Session Items */}
      <ScrollArea className="flex-1 px-4">
        {activeSessionId && sessionItems.length > 0 ? (
          <div className="space-y-2 pb-4">
            {sessionItems.map((item: any) => (
              <Card key={item.id} className="border">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium text-sm truncate">{item.product?.name || item.notes || ''}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>الكمية: <strong>{fmtQty(item.quantity)}</strong></span>
                      {item.gift_quantity > 0 && (
                        <>
                          <span>|</span>
                          <span className="text-destructive">هدايا: <strong>{fmtQty(item.gift_quantity)}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveSessionItem(item)}
                    disabled={deleteSessionItem.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : activeSessionId ? (
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد منتجات في الجلسة بعد</p>
            <p className="text-xs">اضغط "إضافة منتج" لبدء الشحن</p>
          </div>
        ) : selectedWorker ? (
          <div className="text-center py-10 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">ابدأ جلسة شحن جديدة</p>
          </div>
        ) : null}
      </ScrollArea>

      {/* Fixed Bottom Buttons */}
      {selectedWorker && (
        <div className="p-4 pt-2 border-t bg-background space-y-2">
          {!activeSessionId ? (
            <>
              <Button onClick={handleStartSession} className="w-full" disabled={createSession.isPending}>
                {createSession.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                <Plus className="w-4 h-4 me-1" />
                بدء جلسة شحن جديدة
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowSessionHistory(true)}>
                  <History className="w-4 h-4 me-1" />
                  سجل الجلسات
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleEmptyTruckPreview}
                  disabled={isEmptying}
                >
                  {isEmptying ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <PackageX className="w-4 h-4 me-1" />}
                  {t('stock.empty_truck')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button onClick={handleOpenAddProduct} className="w-full">
                <Plus className="w-4 h-4 me-1" />
                إضافة منتج
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleCompleteSession}
                  disabled={sessionItems.length === 0 || completeSession.isPending}
                >
                  {completeSession.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  <Save className="w-4 h-4 me-1" />
                  تأكيد الشحن
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleEmptyTruckPreview}
                  disabled={isEmptying}
                >
                  <PackageX className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add Product Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              إضافة منتج للشاحنة
            </DialogTitle>
          </DialogHeader>
          {addProductId && (() => {
            const product = allProductOptions.find(p => p.id === addProductId);
            const available = getAvailableQuantity(addProductId);
            const suggestion = suggestions.find(s => s.product_id === addProductId);
            const offer = productOffers[addProductId];
            // Calculate loaded this session for this product
            const loadedThisSession = sessionItems
              .filter((si: any) => si.product_id === addProductId)
              .reduce((sum: number, si: any) => sum + (si.quantity || 0), 0);
            const previousStock = (suggestion?.current_stock || 0) - loadedThisSession;
            return (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="font-semibold text-sm text-center">{product?.name}</div>
                  <div className="flex items-center justify-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>المتاح: <strong>{fmtQty(available)}</strong></span>
                    <span>|</span>
                    <span>في الشاحنة: <strong>{fmtQty(suggestion?.current_stock || previousStock)}</strong></span>
                    {suggestion && suggestion.suggested_load > 0 && (
                      <>
                        <span>|</span>
                        <span>يحتاج: <strong className="text-destructive">{fmtQty(suggestion.suggested_load)}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>الكمية (صندوق)</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="any"
                    max={available}
                    value={addProductQty}
                    onFocus={e => e.target.select()}
                    onChange={e => setAddProductQty(parseFloat(e.target.value) || 0)}
                    className="text-center text-lg h-12"
                  />
                </div>

                {offer && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-md p-2">
                      <Gift className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span>عرض: <strong>{offer.giftQty} {offer.giftUnit === 'piece' ? 'قطعة' : 'صندوق'}</strong> لكل <strong>{offer.minQty}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm shrink-0">هدايا:</Label>
                      <Input
                        type="number"
                        min={0}
                        value={addProductGiftQty}
                        onFocus={e => e.target.select()}
                        onChange={e => setAddProductGiftQty(parseInt(e.target.value) || 0)}
                        className="text-center h-9"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">{addProductGiftUnit === 'piece' ? 'قطعة' : 'صندوق'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={handleAddProductToSession} disabled={isSaving || addProductQty <= 0} className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Plus className="w-4 h-4 me-1" />
              إضافة للشاحنة
            </Button>
            <Button variant="outline" onClick={() => setShowAddProductDialog(false)} className="w-full">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session History Dialog */}
      <Dialog open={showSessionHistory} onOpenChange={setShowSessionHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              سجل جلسات الشحن
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">لا توجد جلسات سابقة</p>
              ) : sessions.map(session => (
                <Card key={session.id} className={`border ${session.status === 'open' ? 'border-primary/30' : ''}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant={session.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                          {session.status === 'open' ? 'مفتوحة' : 'مكتملة'}
                        </Badge>
                        <span className="text-xs text-muted-foreground ms-2">
                          {new Date(session.created_at).toLocaleDateString('ar-DZ')}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {session.status === 'open' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setActiveSessionId(session.id);
                              setShowSessionHistory(false);
                            }}
                          >
                            استئناف
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={deleteSession.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      المدير: {(session.manager as any)?.full_name || '—'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Empty Truck Dialog */}
      <Dialog open={showEmptyDialog} onOpenChange={setShowEmptyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageX className="w-5 h-5 text-destructive" />
              {t('stock.empty_truck')}
            </DialogTitle>
            <DialogDescription>{t('stock.empty_truck_confirm')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-3">
            {emptyTruckItems.map((item, idx) => {
              const maxReturn = Math.max(0, item.quantity - item.pendingNeeded);
              return (
                <Card key={item.product_id} className="border">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{item.product_name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{t('stock.in_truck')}: <strong>{item.quantity}</strong></span>
                        <span>{t('stock.orders_need')}: <strong>{item.pendingNeeded}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-xs">{t('stock.return_qty')}</Label>
                        <Input
                          type="number" min={0} max={maxReturn}
                          value={item.returnQty}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), maxReturn);
                            setEmptyTruckItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: val } : it));
                          }}
                          className="text-center h-8"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-sm bg-muted/50 rounded-md p-2">
            <span className="font-medium">{t('stock.total_return')}</span>
            <Badge variant="destructive">{emptyTruckItems.reduce((s, it) => s + it.returnQty, 0)} {t('stock.boxes')}</Badge>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEmptyDialog(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleEmptyTruckConfirm} disabled={isEmptying || emptyTruckItems.every(it => it.returnQty === 0)}>
              {isEmptying && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('stock.confirm_return')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worker Picker */}
      <WorkerPickerDialog
        open={showWorkerPicker} onOpenChange={setShowWorkerPicker}
        workers={workers} selectedWorkerId={selectedWorker}
        onSelect={setSelectedWorker} stockAlerts={stockAlerts}
      />

      {/* Product Picker */}
      <ProductPickerDialog
        open={showProductPicker} onOpenChange={setShowProductPicker}
        products={allProductOptions}
        selectedProductIds={sessionItems.map((i: any) => i.product_id)}
        onSelect={handleProductSelected}
      />
    </div>
  );
};

export default LoadStock;
