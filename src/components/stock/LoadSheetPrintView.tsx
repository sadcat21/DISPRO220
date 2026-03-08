import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Printer, Package, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import OrdersPrintView from '@/components/print/OrdersPrintView';
import type { PrintColumnConfig } from '@/components/print/OrdersPrintView';
import PrintColumnsConfigDialog from '@/components/print/PrintColumnsConfigDialog';
import { OrderWithDetails, Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWorkerPrintInfo } from '@/hooks/useWorkerPrintInfo';

const LOADSHEET_COLUMNS_KEY = 'loadsheet_columns_v1';

const DEFAULT_LOADSHEET_COLUMNS: PrintColumnConfig[] = [
  { id: 'number', labelKey: 'print.header.number', visible: true },
  { id: 'order_id', labelKey: 'print.header.order_id', visible: false },
  { id: 'qr', labelKey: 'print.header.qr', visible: false },
  { id: 'customer', labelKey: 'print.header.customer', visible: true },
  { id: 'store_name', labelKey: 'print.header.store_name', visible: true },
  { id: 'phone', labelKey: 'print.header.phone', visible: true },
  { id: 'address', labelKey: 'print.header.address', visible: true },
  { id: 'sector', labelKey: 'print.header.sector', visible: true },
  { id: 'zone', labelKey: 'print.header.zone', visible: true },
  { id: 'delivery_worker', labelKey: 'print.header.delivery_worker', visible: true },
  { id: 'payment_info', labelKey: 'print.header.payment_info', visible: true },
  { id: 'products', labelKey: 'print.columns.products', visible: true },
  { id: 'total_amount', labelKey: 'print.header.total_amount', visible: true },
];

interface LoadSheetPrintViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  branchId: string | null;
}

const LoadSheetPrintView: React.FC<LoadSheetPrintViewProps> = ({
  open,
  onOpenChange,
  workerId,
  workerName,
  branchId,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [orderItems, setOrderItems] = useState<Map<string, any[]>>(new Map());
  const [products, setProducts] = useState<Product[]>([]);
  const [surplusMap, setSurplusMap] = useState<Record<string, number>>({});
  const [isPrintReady, setIsPrintReady] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [columnConfig, setColumnConfig] = useState<PrintColumnConfig[]>(DEFAULT_LOADSHEET_COLUMNS);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  const { activeBranch, workerId: currentWorkerId } = useAuth();
  const { tp } = useLanguage();
  const { data: workerPrintInfo } = useWorkerPrintInfo(workerId);

  const printRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);

  // Load column config from DB
  useEffect(() => {
    const loadColumnConfig = async () => {
      const bId = activeBranch?.id || null;
      let query = supabase
        .from('app_settings')
        .select('value')
        .eq('key', LOADSHEET_COLUMNS_KEY);
      if (bId) query = query.eq('branch_id', bId);
      else query = query.is('branch_id', null);
      
      const { data } = await query.maybeSingle();
      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Merge with defaults to pick up new columns
            const merged = DEFAULT_LOADSHEET_COLUMNS.map(def => {
              const saved = parsed.find((p: any) => p.id === def.id);
              return saved ? { ...def, visible: saved.visible } : def;
            });
            // Reorder based on saved order
            const orderedIds = parsed.map((p: any) => p.id);
            merged.sort((a, b) => {
              const ai = orderedIds.indexOf(a.id);
              const bi = orderedIds.indexOf(b.id);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
            setColumnConfig(merged);
          }
        } catch { /* use default */ }
      } else if (bId) {
        // Fallback to global
        const { data: globalData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', LOADSHEET_COLUMNS_KEY)
          .is('branch_id', null)
          .maybeSingle();
        if (globalData?.value) {
          try {
            const parsed = JSON.parse(globalData.value);
            if (Array.isArray(parsed)) {
              const merged = DEFAULT_LOADSHEET_COLUMNS.map(def => {
                const saved = parsed.find((p: any) => p.id === def.id);
                return saved ? { ...def, visible: saved.visible } : def;
              });
              const orderedIds = parsed.map((p: any) => p.id);
              merged.sort((a, b) => {
                const ai = orderedIds.indexOf(a.id);
                const bi = orderedIds.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
              });
              setColumnConfig(merged);
            }
          } catch { /* use default */ }
        }
      }
    };
    loadColumnConfig();
  }, [activeBranch?.id]);

  const saveColumnConfig = async (cols: PrintColumnConfig[]) => {
    setColumnConfig(cols);
    const bId = activeBranch?.id || null;
    const payload = {
      key: LOADSHEET_COLUMNS_KEY,
      value: JSON.stringify(cols.map(c => ({ id: c.id, visible: c.visible }))),
      branch_id: bId,
      updated_by: currentWorkerId || null,
      updated_at: new Date().toISOString(),
    };
    await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'branch_id,key' });
  };

  useEffect(() => {
    if (!open || !workerId) return;
    fetchData();
  }, [open, workerId]);

  useEffect(() => {
    if (!open || orders.length === 0) return;
    const updateScale = () => {
      const viewportWidth = previewViewportRef.current?.clientWidth || 0;
      const contentWidth = previewContentRef.current?.scrollWidth || 0;
      if (!viewportWidth || !contentWidth) return;
      const fitScale = Math.min(1, viewportWidth / contentWidth);
      setPreviewScale(fitScale > 0 ? fitScale : 1);
    };
    const raf = requestAnimationFrame(updateScale);
    window.addEventListener('resize', updateScale);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && previewViewportRef.current) {
      resizeObserver = new ResizeObserver(updateScale);
      resizeObserver.observe(previewViewportRef.current);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateScale);
      resizeObserver?.disconnect();
    };
  }, [open, orders.length, products.length, columnConfig]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*, sector:sectors(name, name_fr), zone:sector_zones(name, name_fr)),
          assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name),
          order_items(*, product:products(*))
        `)
        .eq('assigned_worker_id', workerId)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      const fetchedOrders = (ordersData || []) as unknown as OrderWithDetails[];

      const itemsMap = new Map<string, any[]>();
      const productMap = new Map<string, Product>();

      for (const order of fetchedOrders) {
        const items = (order as any).order_items || [];
        itemsMap.set(order.id, items);
        for (const item of items) {
          if (item.product) {
            productMap.set(item.product_id, item.product as Product);
          }
        }
      }

      setOrders(fetchedOrders);
      setOrderItems(itemsMap);
      setProducts(Array.from(productMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '')));

      // Fetch surplus
      const { data: surplusData } = await supabase
        .from('stock_discrepancies')
        .select('product_id, remaining_quantity')
        .eq('worker_id', workerId)
        .eq('discrepancy_type', 'surplus')
        .eq('status', 'pending');

      const sMap: Record<string, number> = {};
      for (const d of (surplusData || [])) {
        sMap[d.product_id] = (sMap[d.product_id] || 0) + (d.remaining_quantity || 0);
      }
      setSurplusMap(sMap);
    } catch (err) {
      console.error('Error fetching load sheet data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    setIsPrintReady(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrintReady(false), 500);
    }, 300);
  };

  const hasData = orders.length > 0;
  const printWorkerName = workerPrintInfo?.printName || workerName;
  const title = `${tp('print.load_sheet') || 'Fiche de Chargement'} - ${printWorkerName}`;
  const printDate = format(new Date(), 'dd/MM/yyyy');

  const hasSurplus = Object.values(surplusMap).some(v => v > 0);
  const extraRows = hasSurplus
    ? [{ label: tp('print.surplus') || 'Surplus', productQuantities: surplusMap, style: 'highlight' as const }]
    : [];

  return (
    <>
      {isPrintReady && (
        <OrdersPrintView
          ref={printRef}
          orders={orders}
          orderItems={orderItems}
          products={products}
          title={title}
          dateRange={printDate}
          isVisible
          extraRows={extraRows}
          columnConfig={columnConfig}
        />
      )}

      <div className="print:hidden">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-hidden" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Printer className="w-4 h-4" />
                {title}
              </DialogTitle>
            </DialogHeader>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !hasData ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                <p>لا توجد طلبيات نشطة لهذا العامل</p>
              </div>
            ) : (
              <>
                <ScrollArea className="max-h-[68vh] rounded-md border border-border">
                  <div ref={previewViewportRef} className="print-preview-surface overflow-auto p-3 bg-background">
                    <div className="flex justify-center">
                      <div
                        className="origin-top-right"
                        style={{
                          transform: `scale(${previewScale})`,
                          width: `${100 / previewScale}%`,
                        }}
                      >
                        <div ref={previewContentRef}>
                          <OrdersPrintView
                            orders={orders}
                            orderItems={orderItems}
                            products={products}
                            title={title}
                            dateRange={printDate}
                            isVisible
                            usePortal={false}
                            extraRows={extraRows}
                            columnConfig={columnConfig}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowColumnSettings(true)} className="gap-1.5">
                    <Settings2 className="w-4 h-4" />
                    إعدادات الأعمدة
                  </Button>
                  <Button onClick={handlePrint} className="gap-2">
                    <Printer className="w-4 h-4" />
                    طباعة ورقة الشحن
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <PrintColumnsConfigDialog
          open={showColumnSettings}
          onOpenChange={setShowColumnSettings}
          columns={columnConfig}
          onColumnsChange={saveColumnConfig}
        />
      </div>
    </>
  );
};

export default LoadSheetPrintView;
