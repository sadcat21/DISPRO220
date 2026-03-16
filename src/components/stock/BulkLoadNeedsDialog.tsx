import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Package, Loader2, Minus, Plus, Truck } from 'lucide-react';
import { WorkerLoadSuggestion } from '@/hooks/useStockAlerts';

interface BulkLoadNeedsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: WorkerLoadSuggestion[];
  products: { id: string; name: string; image_url?: string | null; pieces_per_box?: number }[];
  warehouseStock: { product_id: string; quantity: number }[];
  isLoading: boolean;
  onConfirm: (items: { productId: string; productName: string; quantity: number; piecesPerBox: number }[]) => Promise<void>;
}

const BulkLoadNeedsDialog: React.FC<BulkLoadNeedsDialogProps> = ({
  open, onOpenChange, suggestions, products, warehouseStock, isLoading, onConfirm,
}) => {
  const deficitSuggestions = useMemo(
    () => suggestions.filter(s => s.suggested_load > 0),
    [suggestions]
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset quantities when dialog opens
  React.useEffect(() => {
    if (open) {
      const initial: Record<string, number> = {};
      deficitSuggestions.forEach(s => {
        initial[s.product_id] = s.suggested_load;
      });
      setQuantities(initial);
    }
  }, [open, deficitSuggestions]);

  const updateQty = (productId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] || 0) + delta),
    }));
  };

  const setQty = (productId: string, value: number) => {
    setQuantities(prev => ({ ...prev, [productId]: Math.max(0, value) }));
  };

  const handleConfirm = async () => {
    const items = deficitSuggestions
      .filter(s => (quantities[s.product_id] || 0) > 0)
      .map(s => {
        const product = products.find(p => p.id === s.product_id);
        return {
          productId: s.product_id,
          productName: s.product_name,
          quantity: quantities[s.product_id] || 0,
          piecesPerBox: product?.pieces_per_box || 20,
        };
      });

    if (items.length === 0) return;
    setIsSaving(true);
    try {
      await onConfirm(items);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const totalItems = deficitSuggestions.filter(s => (quantities[s.product_id] || 0) > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90dvh] flex flex-col p-0" dir="rtl">
        <DialogHeader className="px-3 pt-3 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Truck className="w-5 h-5 text-destructive" />
            شحن الاحتياج
            <Badge variant="destructive" className="text-[10px] rounded-full">{deficitSuggestions.length} منتج</Badge>
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="space-y-2 pb-4">
            {deficitSuggestions.map(s => {
              const product = products.find(p => p.id === s.product_id);
              const imageUrl = (product as any)?.image_url;
              const available = warehouseStock.find(ws => ws.product_id === s.product_id)?.quantity || 0;
              const qty = quantities[s.product_id] || 0;

              return (
                <div key={s.product_id} className="flex items-center gap-2 p-2.5 rounded-xl ring-1 ring-border/40 bg-card">
                  {/* Product Image */}
                  <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={s.product_name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Package className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[12px] truncate">{s.product_name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                      <span>يحتاج: <strong className="text-destructive">{s.suggested_load}</strong></span>
                      <span className="text-border">|</span>
                      <span>المتاح: <strong>{available}</strong></span>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-lg"
                      onClick={() => updateQty(s.product_id, -1)}
                      disabled={qty <= 0}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={qty}
                      onChange={e => setQty(s.product_id, parseFloat(e.target.value) || 0)}
                      className="w-14 h-7 text-center text-sm font-bold px-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-lg"
                      onClick={() => updateQty(s.product_id, 1)}
                      disabled={qty >= available}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="px-3 pb-3 pt-2 border-t shrink-0">
          <Button
            onClick={handleConfirm}
            disabled={isSaving || totalItems === 0}
            className="w-full h-10 rounded-xl text-[13px] shadow-sm"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            <Truck className="w-4 h-4 me-1" />
            شحن {totalItems} منتج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkLoadNeedsDialog;
