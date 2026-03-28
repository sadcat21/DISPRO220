import React, { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Truck, Package, Loader2, AlertTriangle, PackageX } from 'lucide-react';
import BoxPieceInput from '@/components/ui/BoxPieceInput';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useWorkerLoadSuggestions } from '@/hooks/useStockAlerts';
import { useMarkProductUnavailable } from '@/hooks/useShortageTracking';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface QuickLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  deficitItems: { product_id: string; product_name: string; deficit: number }[];
}

interface LoadEntry {
  product_id: string;
  product_name: string;
  deficit: number;
  quantity: number;
  warehouseAvailable: number;
}

const QuickLoadDialog: React.FC<QuickLoadDialogProps> = ({
  open, onOpenChange, workerId, workerName, deficitItems
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { warehouseStock, loadToWorker } = useWarehouseStock();
  const { data: suggestions = [] } = useWorkerLoadSuggestions(open ? workerId : null);
  const markUnavailable = useMarkProductUnavailable();
  const [entries, setEntries] = useState<LoadEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [markingProduct, setMarkingProduct] = useState<string | null>(null);
  const confirmLockRef = useRef(false);

  const handleMarkUnavailable = async (productId: string, productName: string) => {
    setMarkingProduct(productId);
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_id, assigned_worker_id, created_by, status, order_items!inner(product_id, quantity)')
        .in('status', ['pending', 'assigned', 'in_progress']);

      const validOrders = (orders || []).filter((o: any) =>
        (o.order_items || []).some((oi: any) => oi.product_id === productId)
      );

      if (validOrders.length === 0) {
        toast.info(t('stock.shortage_no_orders'));
        return;
      }

      const mappedOrders = validOrders.map((o: any) => {
        const item = (o.order_items || []).find((oi: any) => oi.product_id === productId);
        return {
          orderId: o.id,
          customerId: o.customer_id,
          workerId: o.assigned_worker_id || o.created_by,
          quantity: item?.quantity || 0,
        };
      });

      await markUnavailable.mutateAsync({ productId, orders: mappedOrders });
      toast.success(`${t('stock.shortage_marked')} ${productName} ${t('stock.shortage_as_unavailable')}`);
      // Remove from entries list
      setEntries(prev => prev.filter(e => e.product_id !== productId));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMarkingProduct(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    const items = deficitItems.map(d => {
      const available = warehouseStock.find(s => s.product_id === d.product_id)?.quantity || 0;
      return {
        product_id: d.product_id,
        product_name: d.product_name,
        deficit: d.deficit,
        quantity: Math.min(d.deficit, available),
        warehouseAvailable: available,
      };
    });
    setEntries(items);
  }, [open, deficitItems, warehouseStock]);

  const updateQty = (index: number, val: number) => {
    setEntries(prev => prev.map((e, i) => 
      i === index ? { ...e, quantity: Math.max(0, Math.min(val, e.warehouseAvailable)) } : e
    ));
  };

  const validEntries = entries.filter(e => e.quantity > 0);
  const totalItems = validEntries.reduce((s, e) => s + e.quantity, 0);

  const handleConfirm = async () => {
    if (confirmLockRef.current || isSaving) return;
    if (validEntries.length === 0) {
      toast.error(t('stock.add_products'));
      return;
    }
    confirmLockRef.current = true;
    setIsSaving(true);
    try {
      const loadItems = validEntries.map(e => ({
        product_id: e.product_id,
        quantity: e.quantity,
        notes: `شحن سريع من التنبيهات - ${e.product_name}`,
      }));
      await loadToWorker(workerId, loadItems);
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      toast.success(t('stock.loaded_success'));
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || t('common.error'));
    } finally {
      confirmLockRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            {t('stock.quick_load')} - {workerName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-2 p-1">
            {entries.map((entry, index) => (
              <div key={entry.product_id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-sm truncate">{entry.product_name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{t('stock.deficit')}: <strong className="text-destructive">{entry.deficit}</strong></span>
                    <span>|</span>
                    <span>{t('stock.available')}: <strong>{entry.warehouseAvailable}</strong></span>
                  </div>
                </div>
                <div className="w-20 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={entry.warehouseAvailable}
                    value={entry.quantity}
                    onFocus={e => e.target.select()}
                    onChange={e => updateQty(index, parseInt(e.target.value) || 0)}
                    className="text-center h-9"
                  />
                </div>
                {entry.warehouseAvailable === 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="outline"
                          className="w-9 h-9 shrink-0 text-orange-700 bg-orange-50 border-orange-300 hover:bg-orange-100 hover:text-orange-800 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-700 dark:hover:bg-orange-900/40"
                          onClick={() => handleMarkUnavailable(entry.product_id, entry.product_name)}
                          disabled={markingProduct === entry.product_id}
                        >
                          <PackageX className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('stock.product_unavailable_short')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {validEntries.length > 0 && (
          <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg p-3">
            <span className="font-medium">{t('print.header.total')}</span>
            <Badge variant="secondary">{totalItems} {t('stock.boxes')}</Badge>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving || validEntries.length === 0}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            {t('stock.confirm_load')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickLoadDialog;
