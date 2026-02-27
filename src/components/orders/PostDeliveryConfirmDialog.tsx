import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, Package, DollarSign, Loader2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ProductChange {
  product_name: string;
  original_quantity: number;
  new_quantity: number;
  unit_price: number;
  difference: number; // positive = increase, negative = decrease
}

interface PostDeliveryConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: ProductChange[];
  originalTotal: number;
  newTotal: number;
  onConfirm: (paymentType: 'full' | 'partial' | 'no_payment', paidAmount?: number) => void;
  isSubmitting: boolean;
}

const PostDeliveryConfirmDialog: React.FC<PostDeliveryConfirmDialogProps> = ({
  open, onOpenChange, changes, originalTotal, newTotal, onConfirm, isSubmitting,
}) => {
  const { t, dir } = useLanguage();
  const [paymentType, setPaymentType] = useState<'full' | 'partial' | 'no_payment'>('full');
  const [partialAmount, setPartialAmount] = useState('');

  const totalDifference = newTotal - originalTotal;
  const isIncrease = totalDifference > 0;
  const isDecrease = totalDifference < 0;
  const absDifference = Math.abs(totalDifference);

  const productChanges = changes.filter(c => c.difference !== 0);
  const increases = productChanges.filter(c => c.difference > 0);
  const decreases = productChanges.filter(c => c.difference < 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            ملخص تعديل الطلبية بعد التوصيل
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)] px-4 py-3">
          <div className="space-y-4">
            {/* Product Movements */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Package className="w-4 h-4" />
                حركة المنتجات
              </h3>

              {increases.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-bold text-red-700 flex items-center gap-1">
                    <ArrowDown className="w-3 h-3" />
                    سحب من المخزن
                  </p>
                  {increases.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{c.product_name}</span>
                      <Badge variant="destructive" className="text-xs">
                        +{c.difference} صندوق
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {decreases.length > 0 && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-bold text-green-700 flex items-center gap-1">
                    <ArrowUp className="w-3 h-3" />
                    إرجاع إلى المخزن
                  </p>
                  {decreases.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{c.product_name}</span>
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        {Math.abs(c.difference)} صندوق
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Impact */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                الأثر المالي
              </h3>

              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ الأصلي:</span>
                  <span>{originalTotal.toLocaleString()} دج</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ الجديد:</span>
                  <span>{newTotal.toLocaleString()} دج</span>
                </div>
                <div className="border-t pt-1 mt-1 flex justify-between font-bold">
                  <span>الفارق:</span>
                  <span className={isIncrease ? 'text-red-600' : isDecrease ? 'text-green-600' : ''}>
                    {isIncrease ? '+' : ''}{totalDifference.toLocaleString()} دج
                  </span>
                </div>
              </div>

              {isIncrease && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                  <p className="font-bold mb-1">💰 العميل مطالب بدفع {absDifference.toLocaleString()} دج إضافية</p>
                </div>
              )}

              {isDecrease && (
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                  <p className="font-bold mb-1">💸 يجب إعادة {absDifference.toLocaleString()} دج للعميل</p>
                </div>
              )}
            </div>

            {/* Payment Method for the difference */}
            {totalDifference !== 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">كيف تم التعامل مع الفارق؟</h3>
                <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">
                      {isIncrease ? 'دفع كامل الفارق' : 'إعادة كامل المبلغ'}
                    </SelectItem>
                    <SelectItem value="partial">
                      {isIncrease ? 'دفع جزئي' : 'إعادة جزئية'}
                    </SelectItem>
                    <SelectItem value="no_payment">
                      {isIncrease ? 'بدون دفع (دين)' : 'بدون إرجاع (رصيد للعميل)'}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {paymentType === 'partial' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder="المبلغ المدفوع/المرتجع"
                      className="h-10"
                      min={0}
                      max={absDifference}
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">/ {absDifference.toLocaleString()} دج</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-2">
          <Button
            className="w-full"
            onClick={() => onConfirm(
              paymentType,
              paymentType === 'partial' ? Number(partialAmount) || 0 : undefined
            )}
            disabled={isSubmitting || (paymentType === 'partial' && (!partialAmount || Number(partialAmount) <= 0))}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'تأكيد التعديل'
            )}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PostDeliveryConfirmDialog;
