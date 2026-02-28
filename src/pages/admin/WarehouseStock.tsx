import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Package, Users, Loader2, ShoppingBag, Search, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';

interface ProductSummary {
  productId: string;
  productName: string;
  received: number;
  workerStock: number;
  sold: number;
  gifts: number;
  damaged: number;
  surplus: number;
  deficit: number;
  remaining: number;
}

const WarehouseStock: React.FC = () => {
  const { t } = useLanguage();
  const { activeBranch } = useAuth();
  const { warehouseStock, workerStocksByWorker, isLoading, products } = useWarehouseStock();
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedWorkers, setExpandedWorkers] = useState(false);

  const branchId = activeBranch?.id;

  // Fetch aggregated data for summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['warehouse-product-summary', branchId],
    queryFn: async () => {
      if (!branchId) return { receipts: [], movements: [], discrepancies: [], workerStocks: [] };

      // First get receipt IDs for this branch
      const { data: branchReceipts } = await supabase
        .from('stock_receipts')
        .select('id')
        .eq('branch_id', branchId);
      
      const receiptIds = (branchReceipts || []).map(r => r.id);

      const [receiptsRes, discrepanciesRes, workerStocksRes] = await Promise.all([
        // Total received per product (filter by receipt IDs)
        receiptIds.length > 0
          ? supabase
              .from('stock_receipt_items')
              .select('product_id, quantity')
              .in('receipt_id', receiptIds)
          : Promise.resolve({ data: [], error: null }),
        // Discrepancies (damaged, surplus, deficit)
        supabase
          .from('stock_discrepancies')
          .select('product_id, quantity, discrepancy_type')
          .eq('branch_id', branchId),
        // Worker stocks
        supabase
          .from('worker_stock')
          .select('product_id, quantity')
          .eq('branch_id', branchId),
      ]);

      return {
        receipts: receiptsRes.data || [],
        discrepancies: discrepanciesRes.data || [],
        workerStocks: workerStocksRes.data || [],
      };
    },
    enabled: !!branchId,
  });

  // Fetch sold from order_items for delivered orders
  const { data: soldData } = useQuery({
    queryKey: ['warehouse-sold-summary', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data: deliveredOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'delivered');
      const orderIds = (deliveredOrders || []).map(o => o.id);
      if (orderIds.length === 0) return [];
      const { data } = await supabase
        .from('order_items')
        .select('product_id, quantity, gift_quantity')
        .in('order_id', orderIds);
      return data || [];
    },
    enabled: !!branchId,
  });

  const productSummaries = useMemo((): ProductSummary[] => {
    if (!products.length) return [];

    const summaries: Record<string, ProductSummary> = {};

    // Initialize all products
    for (const p of products) {
      summaries[p.id] = {
        productId: p.id,
        productName: p.name,
        received: 0,
        workerStock: 0,
        sold: 0,
        gifts: 0,
        damaged: 0,
        surplus: 0,
        deficit: 0,
        remaining: 0,
      };
    }

    // Received
    for (const r of (summaryData?.receipts || [])) {
      if (summaries[r.product_id]) {
        summaries[r.product_id].received += Number(r.quantity || 0);
      }
    }

    // Worker stocks
    for (const ws of (summaryData?.workerStocks || [])) {
      if (summaries[ws.product_id]) {
        summaries[ws.product_id].workerStock += Number(ws.quantity || 0);
      }
    }

    // Sold from order_items (delivered orders)

    // Sold from order_items (delivered)
    for (const oi of (soldData || [])) {
      if (summaries[oi.product_id]) {
        summaries[oi.product_id].sold += Number(oi.quantity || 0);
        summaries[oi.product_id].gifts += Number(oi.gift_quantity || 0);
      }
    }

    // Discrepancies
    for (const d of (summaryData?.discrepancies || [])) {
      if (!summaries[d.product_id]) continue;
      const qty = Number(d.quantity || 0);
      if (d.discrepancy_type === 'deficit') {
        summaries[d.product_id].deficit += qty;
      } else if (d.discrepancy_type === 'surplus') {
        summaries[d.product_id].surplus += qty;
      } else if (d.discrepancy_type === 'damaged') {
        summaries[d.product_id].damaged += qty;
      }
    }

    // Remaining = warehouse stock
    for (const ws of warehouseStock) {
      if (summaries[ws.product_id]) {
        summaries[ws.product_id].remaining = Number(ws.quantity || 0);
      }
    }

    // Show all products - columns appear even with 0 values
    return Object.values(summaries)
      .sort((a, b) => {
        // Products with any activity first
        const aHas = a.received + a.workerStock + a.sold + a.remaining + a.deficit + a.surplus + a.damaged;
        const bHas = b.received + b.workerStock + b.sold + b.remaining + b.deficit + b.surplus + b.damaged;
        if (aHas > 0 && bHas === 0) return -1;
        if (bHas > 0 && aHas === 0) return 1;
        return a.productName.localeCompare(b.productName);
      });
  }, [products, summaryData, soldData, warehouseStock]);

  const filteredSummaries = useMemo(() => {
    if (!search.trim()) return productSummaries;
    return productSummaries.filter(s => s.productName.includes(search));
  }, [productSummaries, search]);

  if (isLoading || summaryLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasStock = warehouseStock.length > 0;
  const stockItemsForSale = warehouseStock.map(s => ({
    id: s.id,
    product_id: s.product_id,
    quantity: s.quantity,
    product: s.product,
  }));

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          {t('stock.warehouse_stock')}
        </h2>
        {hasStock && (
          <Button size="sm" onClick={() => setShowSaleDialog(true)}>
            <ShoppingBag className="w-4 h-4 ml-1" />
            {t('stock.direct_sale')}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="بحث عن منتج..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      {/* Product Summary Table */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Package className="w-4 h-4" />
          ملخص المخزون حسب المنتج
          <Badge variant="secondary" className="text-xs">{filteredSummaries.length}</Badge>
        </h3>

        {filteredSummaries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              لا توجد بيانات مخزون
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="max-h-[calc(100vh-22rem)]">
            <div className="space-y-2 pb-2">
              {filteredSummaries.map(s => (
                <Card key={s.productId} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="font-medium text-sm mb-2 text-primary truncate">{s.productName}</div>
                    <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">المستلم</span>
                        <span className="font-bold text-green-600">{s.received}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">عند العمال</span>
                        <span className="font-bold text-blue-600">{s.workerStock}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">المباع</span>
                        <span className="font-bold text-orange-600">{s.sold}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">الهدايا</span>
                        <span className={`font-bold ${s.gifts > 0 ? 'text-pink-500' : 'text-muted-foreground'}`}>{s.gifts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">التالف</span>
                        <span className={`font-bold ${s.damaged > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{s.damaged}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">الفائض</span>
                        <span className={`font-bold ${s.surplus > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{s.surplus}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">العجز</span>
                        <span className={`font-bold ${s.deficit > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{s.deficit}</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t flex justify-between items-center">
                      <span className="text-xs font-semibold">المتبقي في المخزن</span>
                      <span className={`text-sm font-bold ${s.remaining > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{s.remaining}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Worker Stocks (collapsible) */}
      <div>
        <button
          className="flex items-center gap-2 w-full text-sm font-semibold text-muted-foreground py-2"
          onClick={() => setExpandedWorkers(prev => !prev)}
        >
          <Users className="w-4 h-4" />
          {t('stock.worker_stock')}
          <Badge variant="secondary" className="text-xs">{Object.keys(workerStocksByWorker).length}</Badge>
          <div className="flex-1" />
          {expandedWorkers ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expandedWorkers && (
          Object.keys(workerStocksByWorker).length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                {t('stock.no_stock')}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {Object.entries(workerStocksByWorker).map(([workerId, data]) => (
                <Card key={workerId}>
                  <CardContent className="p-3">
                    <div className="font-semibold text-sm mb-2 text-primary">
                      {data.worker?.full_name || t('common.unknown')}
                    </div>
                    <div className="space-y-1">
                      {data.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{item.product?.name}</span>
                          <span className="font-medium">{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      <DirectSaleDialog
        open={showSaleDialog}
        onOpenChange={setShowSaleDialog}
        stockItems={stockItemsForSale}
        stockSource="warehouse"
      />
    </div>
  );
};

export default WarehouseStock;
