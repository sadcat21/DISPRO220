import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, PackageX, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { WarehouseGapItem } from '@/hooks/useWarehouseGap';

interface WarehouseGapDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gap: WarehouseGapItem | null;
  onMarkUnavailable?: (productId: string, productName: string) => void;
  isMarking?: boolean;
}

const WarehouseGapDetailsDialog: React.FC<WarehouseGapDetailsDialogProps> = ({
  open, onOpenChange, gap, onMarkUnavailable, isMarking
}) => {
  const { t, dir } = useLanguage();

  if (!gap) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <span className="block">{gap.product_name}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('stock.warehouse_gap_needed')}: {gap.total_needed} • {t('stock.warehouse_gap_available')}: {gap.warehouse_stock} • {t('stock.warehouse_gap_deficit')}: -{gap.deficit}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-10rem)]">
          <div className="p-3 space-y-2">
            {gap.orders.map((order, idx) => (
              <div key={`${order.order_id}-${idx}`} className="border rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{order.customer_name || '-'}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {order.quantity} {t('stock.boxes')}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>

        {onMarkUnavailable && (
          <div className="p-3 border-t bg-muted/20">
            <Button
              variant="outline"
              className="w-full gap-2 text-orange-700 bg-orange-50 border-orange-300 hover:bg-orange-100 hover:text-orange-800 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-700 dark:hover:bg-orange-900/40"
              onClick={() => onMarkUnavailable(gap.product_id, gap.product_name)}
              disabled={isMarking}
            >
              <PackageX className="w-4 h-4" />
              {t('stock.product_unavailable_short')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WarehouseGapDetailsDialog;
