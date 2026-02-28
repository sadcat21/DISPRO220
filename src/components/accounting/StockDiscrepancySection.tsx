import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, TrendingUp, TrendingDown, Check, Package, DollarSign } from 'lucide-react';
import { StockDiscrepancy, useResolveDiscrepancy } from '@/hooks/useStockDiscrepancies';
import { toast } from 'sonner';

interface StockDiscrepancySectionProps {
  discrepancies: StockDiscrepancy[];
  accountingSessionId?: string;
}

const fmt = (n: number) => n.toLocaleString();

const StockDiscrepancySection: React.FC<StockDiscrepancySectionProps> = ({ discrepancies, accountingSessionId }) => {
  const resolveDiscrepancy = useResolveDiscrepancy();
  const [pricingSelections, setPricingSelections] = useState<Record<string, { method: string; manualPrice: string }>>({});

  const pendingDiscrepancies = discrepancies.filter(d => d.status === 'pending');

  if (pendingDiscrepancies.length === 0) return null;

  const surplusItems = pendingDiscrepancies.filter(d => d.discrepancy_type === 'surplus');
  const deficitItems = pendingDiscrepancies.filter(d => d.discrepancy_type === 'deficit');

  const getPriceByMethod = (d: StockDiscrepancy, method: string, manualPrice?: string): number => {
    const product = d.product;
    if (!product) return 0;
    switch (method) {
      case 'invoice1_gros': return product.price_gros || 0;
      case 'invoice1_super_gros': return product.price_super_gros || 0;
      case 'invoice1_retail': return product.price_retail || 0;
      case 'invoice2': return product.price_invoice || 0;
      case 'manual': return Number(manualPrice || 0);
      default: return 0;
    }
  };

  const handleResolveDeficit = async (d: StockDiscrepancy) => {
    const selection = pricingSelections[d.id];
    if (!selection?.method) {
      toast.error('اختر طريقة التسعير');
      return;
    }
    const pricePerUnit = getPriceByMethod(d, selection.method, selection.manualPrice);
    const totalValue = pricePerUnit * d.quantity;
    
    try {
      await resolveDiscrepancy.mutateAsync({
        id: d.id,
        pricing_method: selection.method,
        price_per_unit: pricePerUnit,
        total_value: totalValue,
        status: 'resolved',
        accounting_session_id: accountingSessionId,
        notes: `تسعير العجز: ${selection.method}`,
      });
      toast.success('تم تسجيل العجز على حساب العامل');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddSurplusToStock = async (d: StockDiscrepancy) => {
    try {
      await resolveDiscrepancy.mutateAsync({
        id: d.id,
        status: 'added_to_stock',
        accounting_session_id: accountingSessionId,
        notes: 'تمت إضافة الفائض إلى مخزون الفائض',
      });
      toast.success('تمت إضافة الفائض');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3">
      {/* Deficit Items */}
      {deficitItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm font-bold">عجز في المنتجات ({deficitItems.length})</span>
          </div>
          {deficitItems.map(d => {
            const selection = pricingSelections[d.id] || { method: '', manualPrice: '' };
            const pricePerUnit = getPriceByMethod(d, selection.method, selection.manualPrice);
            const totalValue = pricePerUnit * d.quantity;
            return (
              <div key={d.id} className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-sm font-semibold">{d.product?.name || '—'}</span>
                  </div>
                  <Badge variant="destructive" className="text-xs">عجز: {fmt(d.quantity)}</Badge>
                </div>
                
                {/* Pricing options */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={selection.method}
                    onValueChange={(v) => setPricingSelections(prev => ({
                      ...prev,
                      [d.id]: { ...prev[d.id], method: v, manualPrice: prev[d.id]?.manualPrice || '' }
                    }))}
                  >
                    <SelectTrigger className="h-8 text-xs w-[140px]">
                      <SelectValue placeholder="طريقة التسعير" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice2">Facture 2</SelectItem>
                       <SelectItem value="invoice1_gros">Gros</SelectItem>
                       <SelectItem value="invoice1_super_gros">Super Gros</SelectItem>
                       <SelectItem value="invoice1_retail">Détail</SelectItem>
                      <SelectItem value="manual">إدخال يدوي</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {selection.method === 'manual' && (
                    <Input
                      type="number"
                      placeholder="السعر"
                      value={selection.manualPrice}
                      onChange={(e) => setPricingSelections(prev => ({
                        ...prev,
                        [d.id]: { ...prev[d.id], manualPrice: e.target.value }
                      }))}
                      className="h-8 text-xs w-[80px]"
                    />
                  )}
                  
                  {selection.method && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="w-3 h-3" />
                      <span>{fmt(totalValue)} DA</span>
                    </div>
                  )}
                </div>
                
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full h-8 text-xs"
                  onClick={() => handleResolveDeficit(d)}
                  disabled={!selection.method || resolveDiscrepancy.isPending}
                >
                  <AlertTriangle className="w-3 h-3 me-1" />
                  تسجيل العجز على حساب العامل
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Surplus Items */}
      {surplusItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-bold">فائض في المنتجات ({surplusItems.length})</span>
          </div>
          {surplusItems.map(d => (
            <div key={d.id} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-sm font-semibold">{d.product?.name || '—'}</span>
                </div>
                <Badge className="bg-amber-500 text-white text-xs">فائض: {fmt(d.quantity)}</Badge>
              </div>
              <Button
                size="sm"
                className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => handleAddSurplusToStock(d)}
                disabled={resolveDiscrepancy.isPending}
              >
                <Check className="w-3 h-3 me-1" />
                إضافة إلى مخزون الفائض
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StockDiscrepancySection;
