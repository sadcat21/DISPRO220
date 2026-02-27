import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, TrendingUp, Package, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateDiscrepancy } from '@/hooks/useStockDiscrepancies';
import { toast } from 'sonner';

interface ReviewItem {
  product_id: string;
  product_name: string;
  system_qty: number;
  actual_qty: string; // string for input control
  status: 'unverified' | 'match' | 'deficit' | 'surplus';
  difference: number; // positive = surplus, negative = deficit
}

interface StockVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  onComplete?: () => void;
}

const StockVerificationDialog: React.FC<StockVerificationDialogProps> = ({
  open, onOpenChange, workerId, onComplete,
}) => {
  const { workerId: currentWorkerId, activeBranch } = useAuth();
  const createDiscrepancy = useCreateDiscrepancy();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!open || !workerId) return;
    setShowSummary(false);
    const fetchWorkerStock = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('worker_stock')
        .select('product_id, quantity, product:products(name)')
        .eq('worker_id', workerId)
        .gt('quantity', 0);
      
      setItems((data || []).map(ws => ({
        product_id: ws.product_id,
        product_name: (ws.product as any)?.name || '',
        system_qty: ws.quantity,
        actual_qty: '',
        status: 'unverified',
        difference: 0,
      })));
      setIsLoading(false);
    };
    fetchWorkerStock();
  }, [open, workerId]);

  const updateActualQty = (productId: string, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.product_id !== productId) return item;
      const numVal = parseFloat(value);
      if (value === '' || isNaN(numVal)) {
        return { ...item, actual_qty: value, status: 'unverified', difference: 0 };
      }
      const diff = numVal - item.system_qty;
      const status: ReviewItem['status'] = 
        Math.abs(diff) < 0.001 ? 'match' : diff > 0 ? 'surplus' : 'deficit';
      return { ...item, actual_qty: value, status, difference: diff };
    }));
  };

  const getStatusBadge = (item: ReviewItem) => {
    if (item.status === 'unverified') return null;
    if (item.status === 'match') return <Badge className="bg-green-600 text-white text-[10px]">مطابق</Badge>;
    if (item.status === 'surplus') return <Badge className="bg-orange-500 text-white text-[10px]">فائض +{Math.abs(item.difference).toFixed(2)}</Badge>;
    return <Badge variant="destructive" className="text-[10px]">عجز -{Math.abs(item.difference).toFixed(2)}</Badge>;
  };

  const discrepancies = items.filter(i => i.status === 'deficit' || i.status === 'surplus');
  const allVerified = items.length > 0 && items.every(i => i.status !== 'unverified');

  const handleShowSummary = () => {
    if (!allVerified) {
      toast.error(`يرجى إدخال الكمية الفعلية لجميع المنتجات (${items.filter(i => i.status === 'unverified').length} متبقي)`);
      return;
    }
    if (discrepancies.length === 0) {
      // All match - confirm directly
      handleConfirm();
      return;
    }
    setShowSummary(true);
  };

  const handleBackToReview = () => {
    setShowSummary(false);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const branchId = activeBranch?.id;

      // Save as a loading session with status 'review'
      const { data: session, error: sessionError } = await supabase
        .from('loading_sessions')
        .insert({
          worker_id: workerId,
          manager_id: currentWorkerId!,
          branch_id: branchId || null,
          status: 'review',
          notes: discrepancies.length > 0 
            ? `جلسة مراجعة - ${discrepancies.length} فارق` 
            : 'جلسة مراجعة - مطابق بالكامل',
        })
        .select()
        .single();
      if (sessionError) throw sessionError;

      // Record each discrepancy
      for (const item of discrepancies) {
        await createDiscrepancy.mutateAsync({
          worker_id: workerId,
          product_id: item.product_id,
          branch_id: branchId || null,
          discrepancy_type: item.status as 'deficit' | 'surplus',
          quantity: Math.abs(item.difference),
          source_session_id: session.id,
          notes: `جلسة مراجعة - ${item.status === 'deficit' ? 'عجز' : 'فائض'}: ${Math.abs(item.difference)}`,
        });
      }

      toast.success(discrepancies.length > 0 
        ? `تم تأكيد المراجعة - ${discrepancies.length} فارق مسجل`
        : 'تم تأكيد المراجعة - جميع المنتجات مطابقة');
      onOpenChange(false);
      onComplete?.();
    } catch (err: any) {
      toast.error(err.message || 'خطأ في تسجيل المراجعة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifiedCount = items.filter(i => i.status !== 'unverified').length;

  // Summary view
  if (showSummary) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              ملخص الفوارق
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              المنتجات التالية بها فروقات - يمكنك التعديل أو العودة للمراجعة
            </p>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[55vh]">
            <div className="space-y-3 p-1">
              {discrepancies.map(item => (
                <Card key={item.product_id} className={`border ${
                  item.status === 'deficit' ? 'border-destructive/40 bg-destructive/5' :
                  'border-orange-300 bg-orange-50/50 dark:bg-orange-900/10'
                }`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{item.product_name}</span>
                      {getStatusBadge(item)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">رصيد النظام:</span>
                        <div className="font-medium">{item.system_qty}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">الكمية الفعلية:</span>
                        <Input
                          type="number"
                          step={0.01}
                          value={item.actual_qty}
                          onChange={e => updateActualQty(item.product_id, e.target.value)}
                          className="h-7 text-sm mt-0.5"
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground">الفارق:</span>
                        <div className={`font-bold ${item.status === 'deficit' ? 'text-destructive' : 'text-orange-600'}`}>
                          {item.status === 'deficit' ? '-' : '+'}{Math.abs(item.difference).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleBackToReview}>
              <ArrowLeft className="w-4 h-4 me-1" />
              العودة للمراجعة
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <CheckCircle className="w-4 h-4 me-1" />
              تأكيد المراجعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Main review view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            جلسة مراجعة المخزون
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            أدخل الكمية الفعلية لكل منتج - سيتم تحديد الحالة تلقائياً
          </p>
          {items.length > 0 && (
            <Badge variant="outline" className="w-fit">
              {verifiedCount}/{items.length} تم المراجعة
            </Badge>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              لا توجد منتجات في رصيد العامل
            </div>
          ) : (
            <div className="space-y-3 p-1">
              {items.map(item => (
                <Card key={item.product_id} className={`border ${
                  item.status === 'match' ? 'border-green-300 bg-green-50/50 dark:bg-green-900/10' :
                  item.status === 'deficit' ? 'border-destructive/40 bg-destructive/5' :
                  item.status === 'surplus' ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-900/10' :
                  ''
                }`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{item.product_name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          النظام: {item.system_qty}
                        </Badge>
                        {getStatusBadge(item)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">الكمية الفعلية:</span>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.actual_qty}
                        onChange={e => updateActualQty(item.product_id, e.target.value)}
                        className="h-8 text-sm flex-1"
                        placeholder="أدخل الكمية الموجودة فعلياً"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`h-8 text-xs whitespace-nowrap ${
                          item.status === 'match'
                            ? 'bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                        onClick={() => updateActualQty(item.product_id, String(item.system_qty))}
                      >
                        <CheckCircle className="w-3.5 h-3.5 me-1" />
                        مطابق
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleShowSummary}
            disabled={isSubmitting || items.length === 0}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            <CheckCircle className="w-4 h-4 me-1" />
            تأكيد المراجعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StockVerificationDialog;
