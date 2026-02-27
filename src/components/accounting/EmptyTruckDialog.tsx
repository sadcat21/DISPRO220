import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, PackageX, AlertTriangle } from 'lucide-react';

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

interface EmptyTruckDialogProps {
  workerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EmptyTruckDialog: React.FC<EmptyTruckDialogProps> = ({ workerId, open, onOpenChange }) => {
  const { t } = useLanguage();
  const { workerId: currentWorkerId, activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const branchId = activeBranch?.id;

  const [isLoading, setIsLoading] = useState(false);
  const [isEmptying, setIsEmptying] = useState(false);
  const [emptyTruckItems, setEmptyTruckItems] = useState<EmptyTruckItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [emptyMode, setEmptyMode] = useState<'full' | 'excess'>('full');

  // Load worker stock when dialog opens
  const loadWorkerStock = async (mode: 'full' | 'excess') => {
    if (!workerId || !branchId || !currentWorkerId) return;
    setIsLoading(true);

    const { data: workerStock } = await supabase
      .from('worker_stock')
      .select('id, product_id, quantity, product:products(name)')
      .eq('worker_id', workerId)
      .gt('quantity', 0);

    if (!workerStock || workerStock.length === 0) {
      toast.error(t('stock.empty_truck_nothing'));
      setIsLoading(false);
      onOpenChange(false);
      return;
    }

    const { data: orders } = await supabase
      .from('orders')
      .select('order_items:order_items(product_id, quantity)')
      .eq('assigned_worker_id', workerId)
      .in('status', ['assigned', 'in_progress']);

    const pendingQty: Record<string, number> = {};
    for (const order of orders || []) {
      for (const item of (order as any).order_items || []) {
        pendingQty[item.product_id] = (pendingQty[item.product_id] || 0) + item.quantity;
      }
    }

    const itemsToReturn = workerStock
      .map(ws => {
        const pending = pendingQty[ws.product_id] || 0;
        const returnQty = mode === 'full' ? ws.quantity : Math.max(0, ws.quantity - pending);
        return {
          id: ws.id,
          product_id: ws.product_id,
          product_name: (ws.product as any)?.name || ws.product_id,
          quantity: ws.quantity,
          pendingNeeded: pending,
          returnQty,
          keepAllocations: [] as KeepAllocation[],
          allocationMode: false,
        };
      })
      .filter(ws => ws.returnQty > 0);

    if (itemsToReturn.length === 0) {
      toast.error(t('stock.empty_truck_nothing'));
      setIsLoading(false);
      onOpenChange(false);
      return;
    }

    setEmptyTruckItems(itemsToReturn);
    setLoaded(true);
    setIsLoading(false);
  };

  // When dialog opens, load data
  React.useEffect(() => {
    if (open && !loaded) {
      loadWorkerStock(emptyMode);
    }
    if (!open) {
      setLoaded(false);
      setEmptyTruckItems([]);
      setEmptyMode('full');
    }
  }, [open]);

  const switchMode = (mode: 'full' | 'excess') => {
    setEmptyMode(mode);
    setLoaded(false);
    loadWorkerStock(mode);
  };

  const handleConfirm = async () => {
    if (!branchId || !currentWorkerId) return;
    setIsEmptying(true);

    try {
      // Validate: returnQty must not exceed truck quantity
      for (const item of emptyTruckItems) {
        if (item.returnQty > item.quantity) {
          toast.error(`${item.product_name}: لا يمكن تفريغ كمية أكبر من الموجود في الشاحنة (${item.quantity})`);
          setIsEmptying(false);
          return;
        }
      }

      // Create an unloading session in loading_sessions
      const { data: unloadSession, error: sessionError } = await supabase
        .from('loading_sessions')
        .insert({
          worker_id: workerId,
          manager_id: currentWorkerId,
          branch_id: branchId,
          status: 'unloaded',
          notes: `تفريغ الشاحنة - ${emptyMode === 'full' ? 'تفريغ كلي' : 'تفريغ الفائض'}`,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Fetch current warehouse stock
      const { data: warehouseStock } = await supabase
        .from('warehouse_stock')
        .select('id, product_id, quantity')
        .eq('branch_id', branchId);

      for (const item of emptyTruckItems) {
        if (item.returnQty <= 0) continue;

        // Save unloading session item
        await supabase.from('loading_session_items').insert({
          session_id: unloadSession.id,
          product_id: item.product_id,
          quantity: item.returnQty,
          gift_quantity: 0,
          notes: item.keepAllocations.filter(a => a.quantity > 0).map(a => `${a.quantity} ${t(`stock.reason_${a.reason}`)}`).join(', ') || null,
        });

        await supabase
          .from('worker_stock')
          .update({ quantity: item.quantity - item.returnQty })
          .eq('id', item.id);

        const existingWarehouse = warehouseStock?.find(s => s.product_id === item.product_id);
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
          worker_id: workerId,
          notes: `تفريغ الشاحنة - إرجاع ${item.returnQty} من ${item.product_name}${keepNote}`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock', workerId] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] });
      queryClient.invalidateQueries({ queryKey: ['sold-products-summary'] });
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
      toast.success(t('stock.empty_truck_success'));
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || t('common.error'));
    } finally {
      setIsEmptying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="w-5 h-5 text-destructive" />
            {t('stock.empty_truck')}
          </DialogTitle>
          <DialogDescription>{t('stock.empty_truck_confirm')}</DialogDescription>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={emptyMode === 'full' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => switchMode('full')}
          >
            {t('stock.empty_full')}
          </Button>
          <Button
            variant={emptyMode === 'excess' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => switchMode('excess')}
          >
            {t('stock.empty_excess')}
          </Button>
        </div>

        {emptyMode === 'full' && emptyTruckItems.some(it => it.pendingNeeded > 0) && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{t('stock.full_empty_warning')}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
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
                                max={item.quantity}
                                value={item.returnQty}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), item.quantity);
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={isEmptying || emptyTruckItems.every(it => it.returnQty === 0)}
              >
                {isEmptying && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                {t('stock.confirm_return')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EmptyTruckDialog;
