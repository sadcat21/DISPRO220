import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, Phone, MapPin, Check, X, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ShortageWithDetails, useResolveShortage } from '@/hooks/useShortageTracking';
import { toast } from 'sonner';

interface ShortageDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  records: ShortageWithDetails[];
}

const ShortageDetailsDialog: React.FC<ShortageDetailsDialogProps> = ({
  open,
  onOpenChange,
  productName,
  records,
}) => {
  const { t, dir } = useLanguage();
  const resolveShortage = useResolveShortage();

  const totalQuantity = records.reduce((sum, r) => sum + r.quantity_needed, 0);

  const handleResolve = async (ids: string[], status: 'fulfilled' | 'cancelled') => {
    try {
      await resolveShortage.mutateAsync({ ids, status });
      toast.success(status === 'fulfilled' ? (t('stock.shortage_fulfilled') || 'تم التسوية') : (t('stock.shortage_cancelled') || 'تم الإلغاء'));
      if (ids.length === records.length) onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleResolveAll = () => handleResolve(records.map(r => r.id), 'fulfilled');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <span className="block">{productName}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {records.length} {t('stock.shortage_customers') || 'عميل'} • {totalQuantity} {t('stock.boxes') || 'صندوق'}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-8rem)]">
          <div className="p-3 space-y-2">
            {records.map((record) => (
              <div
                key={record.id}
                className="border rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm">{record.customer?.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {record.quantity_needed} {t('stock.boxes') || 'صندوق'}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {record.customer?.phone && (
                    <a
                      href={`tel:${record.customer.phone}`}
                      className="flex items-center gap-1 text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="w-3 h-3" />
                      {record.customer.phone}
                    </a>
                  )}
                  {record.customer?.wilaya && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {record.customer.wilaya}
                    </span>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                    onClick={() => handleResolve([record.id], 'fulfilled')}
                    disabled={resolveShortage.isPending}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('stock.shortage_done') || 'تم التسوية'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs gap-1 text-muted-foreground"
                    onClick={() => handleResolve([record.id], 'cancelled')}
                    disabled={resolveShortage.isPending}
                  >
                    <X className="w-3.5 h-3.5" />
                    {t('common.cancel') || 'إلغاء'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t bg-muted/20">
          <Button
            className="w-full gap-2"
            onClick={handleResolveAll}
            disabled={resolveShortage.isPending}
          >
            <Check className="w-4 h-4" />
            {t('stock.shortage_resolve_all') || 'تسوية الكل'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShortageDetailsDialog;
