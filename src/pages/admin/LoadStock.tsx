import React, { useState, useEffect, useMemo } from 'react';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Trash2, Truck, AlertTriangle, Package, CheckCircle, PackageX, ArrowLeftRight, User, ChevronDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import WorkerPickerDialog from '@/components/stock/WorkerPickerDialog';
import ProductPickerDialog from '@/components/stock/ProductPickerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useWorkerLoadSuggestions, useStockAlerts } from '@/hooks/useStockAlerts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface LoadItem {
  product_id: string;
  quantity: number;
  allocationMode: boolean;
  allocations: KeepAllocation[];
}

interface KeepAllocation {
  reason: string;
  quantity: number;
}

interface EmptyTruckItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  pendingNeeded: number;
  returnQty: number;
  keepAllocations: KeepAllocation[];
  allocationMode: boolean;
}

const KEEP_REASONS = ['cash_sale', 'offer_gifts', 'reserve', 'other'] as const;
const newLoadItem = (product_id = '', quantity = 1): LoadItem => ({ product_id, quantity, allocationMode: false, allocations: [] });

const LoadStock: React.FC = () => {
  const { t } = useLanguage();
  const { workerId: currentWorkerId } = useAuth();
  const queryClient = useQueryClient();
  const { warehouseStock, workers, products, loadToWorker, isLoading, branchId, refresh } = useWarehouseStock();

  const { workerId: contextWorkerId, clearSelectedWorker } = useSelectedWorker();
  const [selectedWorker, setSelectedWorker] = useState(() => contextWorkerId || '');
  const [items, setItems] = useState<LoadItem[]>([newLoadItem()]);
  const [isSaving, setIsSaving] = useState(false);
  const [isEmptying, setIsEmptying] = useState(false);
  const [emptyTruckItems, setEmptyTruckItems] = useState<EmptyTruckItem[]>([]);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);

  const { data: stockAlerts = [] } = useStockAlerts();

  const { data: suggestions = [], isLoading: suggestionsLoading } = useWorkerLoadSuggestions(
    selectedWorker || null
  );

  // Auto-fill items from suggestions when worker is selected
  useEffect(() => {
    if (selectedWorker && suggestions.length > 0) {
      const autoItems = suggestions
        .filter(s => s.suggested_load > 0)
        .map(s => newLoadItem(s.product_id, s.suggested_load));
      
      if (autoItems.length > 0) {
        setItems(autoItems);
      } else {
        setItems([newLoadItem()]);
      }
    }
  }, [selectedWorker, suggestions]);

  const addItem = () => {
    setItems(prev => [...prev, newLoadItem()]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof LoadItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const getAvailableQuantity = (productId: string) => {
    return warehouseStock.find(s => s.product_id === productId)?.quantity || 0;
  };

  const getSuggestion = (productId: string) => {
    return suggestions.find(s => s.product_id === productId);
  };

  const handleLoad = async () => {
    if (!selectedWorker) {
      toast.error(t('stock.select_worker'));
      return;
    }

    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error(t('stock.add_products'));
      return;
    }

    setIsSaving(true);
    try {
      const loadItems = validItems.map(item => {
        const allocDetails = item.allocations
          .filter(a => a.quantity > 0)
          .map(a => `${a.quantity} ${t(`stock.reason_${a.reason}`)}`)
          .join(', ');
        const notes = allocDetails
          ? `شحن من المخزن | تخصيص: ${allocDetails}`
          : 'شحن من المخزن إلى عامل التوصيل';
        return { product_id: item.product_id, quantity: item.quantity, notes };
      });
      await loadToWorker(selectedWorker, loadItems);
      toast.success(t('stock.loaded_success'));
      setSelectedWorker('');
      setItems([newLoadItem()]);
    } catch (error: any) {
      console.error('Error loading stock:', error);
      toast.error(error.message || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Summary of suggestions
  const hasDeficit = suggestions.some(s => s.suggested_load > 0);
  const totalDeficit = suggestions.reduce((sum, s) => sum + s.suggested_load, 0);

  // Build product options: warehouse stock + all active products (for suggestions)
  // Fetch product group mappings
  const [productGroupMap, setProductGroupMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const fetchGroups = async () => {
      const { data: mappings } = await supabase
        .from('product_pricing_groups')
        .select('product_id, group:pricing_groups(name)');
      if (mappings) {
        const map: Record<string, string> = {};
        for (const m of mappings) {
          map[m.product_id] = (m.group as any)?.name || '';
        }
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

  // Calculate items to return and show dialog
  const handleEmptyTruckPreview = async () => {
    if (!selectedWorker || !branchId || !currentWorkerId) return;

    const { data: workerStock } = await supabase
      .from('worker_stock')
      .select('id, product_id, quantity, product:products(name)')
      .eq('worker_id', selectedWorker)
      .gt('quantity', 0);

    if (!workerStock || workerStock.length === 0) {
      toast.error(t('stock.empty_truck_nothing'));
      return;
    }

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
      .map(ws => {
        const maxReturn = Math.max(0, ws.quantity - (pendingQty[ws.product_id] || 0));
        return {
          id: ws.id,
          product_id: ws.product_id,
          product_name: (ws.product as any)?.name || ws.product_id,
          quantity: ws.quantity,
          pendingNeeded: pendingQty[ws.product_id] || 0,
          returnQty: maxReturn,
          keepAllocations: [] as KeepAllocation[],
          allocationMode: false,
        };
      })
      .filter(ws => (ws.quantity - ws.pendingNeeded) > 0);

    if (itemsToReturn.length === 0) {
      toast.error(t('stock.empty_truck_nothing'));
      return;
    }

    setEmptyTruckItems(itemsToReturn);
    setShowEmptyDialog(true);
  };

  // Execute empty truck
  const handleEmptyTruckConfirm = async () => {
    if (!branchId || !currentWorkerId) return;
    setIsEmptying(true);
    setShowEmptyDialog(false);
    try {
      for (const item of emptyTruckItems) {
        if (item.returnQty <= 0) continue;
        
        await supabase
          .from('worker_stock')
          .update({ quantity: item.quantity - item.returnQty })
          .eq('id', item.id);

        const existingWarehouse = warehouseStock.find(s => s.product_id === item.product_id);
        if (existingWarehouse) {
          await supabase
            .from('warehouse_stock')
            .update({ quantity: existingWarehouse.quantity + item.returnQty })
            .eq('id', existingWarehouse.id);
        } else {
          await supabase.from('warehouse_stock').insert({
            branch_id: branchId,
            product_id: item.product_id,
            quantity: item.returnQty,
          });
        }

        const totalKeep = item.keepAllocations.reduce((s, a) => s + a.quantity, 0);
        const keepDetails = item.keepAllocations
          .filter(a => a.quantity > 0)
          .map(a => `${a.quantity} ${t(`stock.reason_${a.reason}`)}`)
          .join(', ');
        const keepNote = totalKeep > 0 
          ? ` | متبقي في الشاحنة: ${totalKeep} (${keepDetails})`
          : '';

        await supabase.from('stock_movements').insert({
          product_id: item.product_id,
          branch_id: branchId,
          quantity: item.returnQty,
          movement_type: 'return',
          status: 'approved',
          created_by: currentWorkerId,
          worker_id: selectedWorker,
          notes: `تفريغ الشاحنة - إرجاع ${item.returnQty} من ${item.product_name}${keepNote}`,
        });
      }

      await refresh();
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      toast.success(t('stock.empty_truck_success'));
    } catch (error: any) {
      toast.error(error.message || t('common.error'));
    } finally {
      setIsEmptying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!branchId) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">{t('stock.load_to_worker')}</h2>
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            {t('branches.select_branch')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Truck className="w-5 h-5 text-primary" />
        {t('stock.load_to_worker')}
      </h2>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>{t('stock.select_worker')}</Label>
            <Button
              variant="outline"
              className="w-full justify-between h-11"
              onClick={() => setShowWorkerPicker(true)}
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span>{selectedWorker ? workers.find(w => w.id === selectedWorker)?.full_name : t('stock.select_worker')}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>

          {/* Worker Stock Summary */}
          {selectedWorker && !suggestionsLoading && suggestions.length > 0 && (
            <Card className={hasDeficit ? 'border-destructive/50 bg-destructive/5' : 'border-green-500/50 bg-green-50 dark:bg-green-950/20'}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {hasDeficit ? (
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  <span className="font-semibold text-sm">
                    {hasDeficit ? t('stock.needs_loading') : t('stock.stock_sufficient')}
                  </span>
                  {hasDeficit && (
                    <Badge variant="destructive" className="ms-auto text-xs">
                      {totalDeficit} {t('stock.boxes')}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1">
                  {suggestions.map(s => (
                    <div key={s.product_id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{s.product_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {t('stock.in_truck')}: <strong>{s.current_stock}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          {t('stock.orders_need')}: <strong>{s.pending_orders_quantity}</strong>
                        </span>
                        {s.suggested_load > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            +{s.suggested_load}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                            ✓
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {suggestionsLoading && selectedWorker && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('stock.load_products')}</Label>
            {items.map((item, index) => {
              const available = getAvailableQuantity(item.product_id);
              const suggestion = getSuggestion(item.product_id);
              return (
                <Card key={index} className="border p-3 space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Button
                        variant="outline"
                        className="w-full justify-between h-10 text-start"
                        onClick={() => setProductPickerIndex(index)}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Package className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">
                            {item.product_id
                              ? allProductOptions.find(p => p.id === item.product_id)?.name || t('stock.product')
                              : t('stock.product')}
                          </span>
                        </div>
                        {item.product_id && (
                          <Badge variant="secondary" className="text-xs ms-2 shrink-0">
                            {available}
                          </Badge>
                        )}
                      </Button>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min={1}
                        max={available}
                        value={item.quantity}
                        onFocus={e => e.target.select()}
                        onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        className="text-center"
                      />
                    </div>
                    {items.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {item.product_id && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{t('stock.available')}: {available}</span>
                      {suggestion && (
                        <>
                          <span>|</span>
                          <span>{t('stock.in_truck')}: {suggestion.current_stock}</span>
                          <span>|</span>
                          <span>{t('stock.orders_need')}: {suggestion.pending_orders_quantity}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Allocation section - show when surplus exists */}
                  {item.product_id && suggestion && (() => {
                    const surplus = item.quantity - suggestion.suggested_load;
                    if (surplus <= 0) return null;
                    const totalAllocated = item.allocations.reduce((s, a) => s + a.quantity, 0);
                    const forOrders = item.quantity - totalAllocated;
                    return (
                      <div className="border-t pt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              +{surplus} {t('stock.surplus')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">{t('stock.allocate_surplus')}</Label>
                            <Switch
                              checked={item.allocationMode}
                              onCheckedChange={checked => {
                                setItems(prev => prev.map((it, i) => i === index
                                  ? { ...it, allocationMode: checked, allocations: [] }
                                  : it
                                ));
                              }}
                            />
                          </div>
                        </div>
                        {item.allocationMode && (
                          <div className="space-y-1.5">
                            {KEEP_REASONS.map(reason => {
                              const allocation = item.allocations.find(a => a.reason === reason);
                              return (
                                <div key={reason} className="flex items-center gap-2">
                                  <span className="text-xs flex-1">{t(`stock.reason_${reason}`)}</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={allocation?.quantity || 0}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0);
                                      setItems(prev => prev.map((it, i) => {
                                        if (i !== index) return it;
                                        const newAllocations = it.allocations.filter(a => a.reason !== reason);
                                        if (val > 0) newAllocations.push({ reason, quantity: val });
                                        return { ...it, allocations: newAllocations };
                                      }));
                                    }}
                                    className="w-20 text-center h-7 text-xs"
                                  />
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between text-xs bg-muted/50 rounded p-1.5">
                              <span>{t('stock.for_orders')}: <strong>{forOrders}</strong></span>
                              <span>{t('stock.allocated')}: <strong>{totalAllocated}</strong></span>
                            </div>
                            {totalAllocated > surplus && (
                              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('stock.allocation_exceeds_surplus')}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </Card>
              );
            })}
            <Button variant="outline" size="sm" onClick={addItem} className="w-full">
              <Plus className="w-4 h-4 ml-1" />
              {t('stock.add_products')}
            </Button>
          </div>

          <Button onClick={handleLoad} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
            {t('stock.confirm_load')}
          </Button>

          {selectedWorker && (
            <Button
              variant="outline"
              onClick={handleEmptyTruckPreview}
              disabled={isEmptying}
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              {isEmptying ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <PackageX className="w-4 h-4 ml-2" />}
              {t('stock.empty_truck')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Empty Truck Confirmation Dialog */}
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
              const totalKeep = item.keepAllocations.reduce((s, a) => s + a.quantity, 0);
              const isAllocMode = item.allocationMode;
              const derivedReturnQty = isAllocMode ? Math.max(0, maxReturn - totalKeep) : item.returnQty;
              const derivedKeepQty = isAllocMode ? totalKeep : (maxReturn - item.returnQty);
              const extraNeeded = isAllocMode && totalKeep > maxReturn ? totalKeep - maxReturn : 0;

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

                    {/* Per-item allocation mode switch */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{t('stock.allocation_mode')}</Label>
                      <Switch checked={isAllocMode} onCheckedChange={checked => {
                        setEmptyTruckItems(prev => prev.map((it, i) => i === idx
                          ? { ...it, allocationMode: checked, returnQty: maxReturn, keepAllocations: [] }
                          : it
                        ));
                      }} />
                    </div>

                    {!isAllocMode ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Label className="text-xs">{t('stock.return_qty')}</Label>
                            <Input
                              type="number"
                              min={0}
                              max={maxReturn}
                              value={item.returnQty}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), maxReturn);
                                setEmptyTruckItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: val, keepAllocations: [] } : it));
                              }}
                              className="text-center h-8"
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">{t('stock.keep_in_truck')}</Label>
                            <Input
                              type="number"
                              min={0}
                              max={maxReturn}
                              value={maxReturn - item.returnQty}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                const keepVal = Math.min(Math.max(0, parseInt(e.target.value) || 0), maxReturn);
                                setEmptyTruckItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: maxReturn - keepVal, keepAllocations: [] } : it));
                              }}
                              className="text-center h-8"
                            />
                          </div>
                        </div>
                        {derivedKeepQty > 0 && (
                          <div className="space-y-1.5 border-t pt-2">
                            <Label className="text-xs font-medium">{t('stock.keep_reason_details')}</Label>
                            {KEEP_REASONS.map(reason => {
                              const allocation = item.keepAllocations.find(a => a.reason === reason);
                              return (
                                <div key={reason} className="flex items-center gap-2">
                                  <span className="text-xs flex-1">{t(`stock.reason_${reason}`)}</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={allocation?.quantity || 0}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0);
                                      setEmptyTruckItems(prev => prev.map((it, i) => {
                                        if (i !== idx) return it;
                                        const newAllocations = it.keepAllocations.filter(a => a.reason !== reason);
                                        if (val > 0) newAllocations.push({ reason, quantity: val });
                                        return { ...it, keepAllocations: newAllocations };
                                      }));
                                    }}
                                    className="w-20 text-center h-7 text-xs"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">{t('stock.keep_reason_details')}</Label>
                          {KEEP_REASONS.map(reason => {
                            const allocation = item.keepAllocations.find(a => a.reason === reason);
                            return (
                              <div key={reason} className="flex items-center gap-2">
                                <span className="text-xs flex-1">{t(`stock.reason_${reason}`)}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={allocation?.quantity || 0}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setEmptyTruckItems(prev => prev.map((it, i) => {
                                      if (i !== idx) return it;
                                      const newAllocations = it.keepAllocations.filter(a => a.reason !== reason);
                                      if (val > 0) newAllocations.push({ reason, quantity: val });
                                      const newTotalKeep = newAllocations.reduce((s, a) => s + a.quantity, 0);
                                      return { ...it, keepAllocations: newAllocations, returnQty: Math.max(0, maxReturn - newTotalKeep) };
                                    }));
                                  }}
                                  className="w-20 text-center h-7 text-xs"
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Label className="text-xs">{t('stock.keep_in_truck')}</Label>
                            <div className="h-8 flex items-center justify-center text-sm font-medium rounded-md border bg-muted/50">
                              {totalKeep}
                            </div>
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">{t('stock.return_qty')}</Label>
                            <div className="h-8 flex items-center justify-center text-sm font-medium rounded-md border bg-muted/50">
                              {derivedReturnQty}
                            </div>
                          </div>
                        </div>
                        {extraNeeded > 0 && (
                          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{t('stock.extra_needed').replace('{qty}', String(extraNeeded))}</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-sm bg-muted/50 rounded-md p-2">
            <span className="font-medium">{t('stock.total_return')}</span>
            <Badge variant="destructive">
              {emptyTruckItems.reduce((sum, it) => sum + it.returnQty, 0)} {t('stock.boxes')}
            </Badge>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEmptyDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleEmptyTruckConfirm} disabled={isEmptying || emptyTruckItems.every(it => it.returnQty === 0)}>
              {isEmptying && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              {t('stock.confirm_return')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worker Picker Dialog */}
      <WorkerPickerDialog
        open={showWorkerPicker}
        onOpenChange={setShowWorkerPicker}
        workers={workers}
        selectedWorkerId={selectedWorker}
        onSelect={setSelectedWorker}
        stockAlerts={stockAlerts}
      />

      {/* Product Picker Dialog */}
      <ProductPickerDialog
        open={productPickerIndex !== null}
        onOpenChange={open => { if (!open) setProductPickerIndex(null); }}
        products={allProductOptions}
        selectedProductIds={items.map(i => i.product_id).filter(Boolean)}
        onSelect={productId => {
          if (productPickerIndex !== null) {
            updateItem(productPickerIndex, 'product_id', productId);
            setProductPickerIndex(null);
          }
        }}
      />
    </div>
  );
};

export default LoadStock;
