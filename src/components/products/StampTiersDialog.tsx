import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Stamp, Plus, Trash2, Edit2, Loader2, Percent, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { useStampTiers, useCreateStampTier, useUpdateStampTier, useDeleteStampTier } from '@/hooks/useStampTiers';
import { StampPriceTier } from '@/types/stamp';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StampTiersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TierFormData {
  min_amount: string;
  max_amount: string;
  percentage: string;
  notes: string;
  is_active: boolean;
}

const StampTiersDialog: React.FC<StampTiersDialogProps> = ({ open, onOpenChange }) => {
  const { data: tiers, isLoading } = useStampTiers();
  const createTier = useCreateStampTier();
  const updateTier = useUpdateStampTier();
  const deleteTier = useDeleteStampTier();

  const [showForm, setShowForm] = useState(false);
  const [editingTier, setEditingTier] = useState<StampPriceTier | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TierFormData>({
    min_amount: '',
    max_amount: '',
    percentage: '',
    notes: '',
    is_active: true,
  });

  const resetForm = () => {
    setFormData({
      min_amount: '',
      max_amount: '',
      percentage: '',
      notes: '',
      is_active: true,
    });
    setEditingTier(null);
    setShowForm(false);
  };

  const handleEdit = (tier: StampPriceTier) => {
    setEditingTier(tier);
    setFormData({
      min_amount: tier.min_amount.toString(),
      max_amount: tier.max_amount?.toString() || '',
      percentage: tier.percentage.toString(),
      notes: tier.notes || '',
      is_active: tier.is_active,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const minAmount = parseFloat(formData.min_amount);
    const maxAmount = formData.max_amount ? parseFloat(formData.max_amount) : null;
    const percentage = parseFloat(formData.percentage);

    if (isNaN(minAmount) || minAmount < 0) {
      toast.error('الرجاء إدخال قيمة بداية صحيحة');
      return;
    }

    if (maxAmount !== null && (isNaN(maxAmount) || maxAmount <= minAmount)) {
      toast.error('قيمة النهاية يجب أن تكون أكبر من البداية');
      return;
    }

    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      toast.error('النسبة يجب أن تكون بين 0 و 100');
      return;
    }

    try {
      if (editingTier) {
        await updateTier.mutateAsync({
          id: editingTier.id,
          min_amount: minAmount,
          max_amount: maxAmount,
          percentage,
          notes: formData.notes || null,
          is_active: formData.is_active,
        });
        toast.success('تم تحديث النطاق بنجاح');
      } else {
        await createTier.mutateAsync({
          min_amount: minAmount,
          max_amount: maxAmount,
          percentage,
          notes: formData.notes || null,
          is_active: formData.is_active,
        });
        toast.success('تم إضافة النطاق بنجاح');
      }
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;

    try {
      await deleteTier.mutateAsync(deleteConfirmId);
      toast.success('تم حذف النطاق');
      setDeleteConfirmId(null);
    } catch (error: any) {
      toast.error(error.message || 'فشل الحذف');
    }
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('ar-DZ');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] p-0 gap-0 overflow-hidden" dir="rtl">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Stamp className="w-5 h-5" />
              نطاقات الطابع الجبائي
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(85vh-8rem)] px-4">
            <div className="py-4 space-y-4">
              {/* Add Button */}
              {!showForm && (
                <Button
                  onClick={() => setShowForm(true)}
                  variant="outline"
                  className="w-full"
                >
                  <Plus className="w-4 h-4 ml-2" />
                  إضافة نطاق جديد
                </Button>
              )}

              {/* Form */}
              {showForm && (
                <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm font-medium mb-2">
                    {editingTier ? 'تعديل النطاق' : 'إضافة نطاق جديد'}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">من (دج)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formData.min_amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, min_amount: e.target.value }))}
                        placeholder="50000"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">إلى (دج) - اختياري</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formData.max_amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, max_amount: e.target.value }))}
                        placeholder="99999"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">النسبة المئوية (%)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={formData.percentage}
                        onChange={(e) => setFormData(prev => ({ ...prev, percentage: e.target.value }))}
                        placeholder="1"
                        className="h-9 pl-10"
                      />
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">ملاحظات (اختياري)</Label>
                    <Input
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="وصف النطاق..."
                      className="h-9"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                    />
                    <Label className="text-sm">مفعّل</Label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={createTier.isPending || updateTier.isPending}
                    >
                      {(createTier.isPending || updateTier.isPending) && (
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      )}
                      {editingTier ? 'تحديث' : 'إضافة'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      إلغاء
                    </Button>
                  </div>
                </form>
              )}

              {/* Tiers List */}
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : tiers && tiers.length > 0 ? (
                <div className="space-y-2">
                  {tiers.map((tier) => (
                    <div
                      key={tier.id}
                      className={`p-3 rounded-lg border ${
                        tier.is_active ? 'bg-background' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {tier.percentage}%
                            </Badge>
                            <span className="text-sm flex items-center gap-1.5">
                              <span className="font-medium">{formatAmount(tier.min_amount)}</span>
                              <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                              <span className="font-medium">
                                {tier.max_amount ? formatAmount(tier.max_amount) : '∞'}
                              </span>
                              <span className="text-xs text-muted-foreground">دج</span>
                            </span>
                            {!tier.is_active && (
                              <Badge variant="outline" className="text-xs">معطّل</Badge>
                            )}
                          </div>
                          {tier.notes && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {tier.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(tier)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirmId(tier.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Stamp className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">لا توجد نطاقات</p>
                  <p className="text-xs">أضف نطاق لتفعيل حساب الطابع التلقائي</p>
                </div>
              )}

              {/* Help Text */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>ملاحظة:</strong> يتم احتساب الطابع الجبائي فقط عند اختيار الدفع بـ "كاش" للفواتير. 
                  النسبة تُحسب من إجمالي مبلغ الفاتورة إذا كان ضمن النطاق المحدد.
                </p>
              </div>
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف النطاق؟</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا النطاق؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTier.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StampTiersDialog;
