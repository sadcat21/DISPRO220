import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MapPin, Plus, Pencil, Trash2, Loader2, Save, X, UserCheck, Truck, Calendar } from 'lucide-react';
import { useSectors } from '@/hooks/useSectors';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sector } from '@/types/database';

interface ManageSectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAYS = [
  { value: 'saturday', label: 'السبت' },
  { value: 'sunday', label: 'الأحد' },
  { value: 'monday', label: 'الاثنين' },
  { value: 'tuesday', label: 'الثلاثاء' },
  { value: 'wednesday', label: 'الأربعاء' },
  { value: 'thursday', label: 'الخميس' },
];

const ManageSectorsDialog: React.FC<ManageSectorsDialogProps> = ({ open, onOpenChange }) => {
  const { workerId, activeBranch } = useAuth();
  const { sectors, isLoading, createSector, updateSector, deleteSector } = useSectors();
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [sectorToDelete, setSectorToDelete] = useState<Sector | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [visitDaySales, setVisitDaySales] = useState('');
  const [visitDayDelivery, setVisitDayDelivery] = useState('');
  const [salesWorkerId, setSalesWorkerId] = useState('');
  const [deliveryWorkerId, setDeliveryWorkerId] = useState('');

  useEffect(() => {
    if (open) {
      fetchWorkers();
    }
  }, [open, activeBranch]);

  const fetchWorkers = async () => {
    let query = supabase.from('workers_safe').select('id, full_name').eq('is_active', true);
    if (activeBranch) query = query.eq('branch_id', activeBranch.id);
    const { data } = await query;
    setWorkers((data || []).map(w => ({ id: w.id!, full_name: w.full_name! })));
  };

  const resetForm = () => {
    setName('');
    setVisitDaySales('');
    setVisitDayDelivery('');
    setSalesWorkerId('');
    setDeliveryWorkerId('');
    setEditingSector(null);
    setShowForm(false);
  };

  const openEditForm = (sector: Sector) => {
    setEditingSector(sector);
    setName(sector.name);
    setVisitDaySales(sector.visit_day_sales || '');
    setVisitDayDelivery(sector.visit_day_delivery || '');
    setSalesWorkerId(sector.sales_worker_id || '');
    setDeliveryWorkerId(sector.delivery_worker_id || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('الرجاء إدخال اسم السكتور');
      return;
    }
    setIsSaving(true);
    try {
      const sectorData = {
        name: name.trim(),
        branch_id: activeBranch?.id || null,
        visit_day_sales: visitDaySales || null,
        visit_day_delivery: visitDayDelivery || null,
        sales_worker_id: salesWorkerId || null,
        delivery_worker_id: deliveryWorkerId || null,
        created_by: workerId,
      };

      if (editingSector) {
        await updateSector(editingSector.id, sectorData);
        toast.success('تم تحديث السكتور بنجاح');
      } else {
        await createSector(sectorData);
        toast.success('تم إنشاء السكتور بنجاح');
      }
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sectorToDelete) return;
    try {
      await deleteSector(sectorToDelete.id);
      toast.success('تم حذف السكتور');
      setSectorToDelete(null);
    } catch (error: any) {
      toast.error(error.message || 'فشل الحذف');
    }
  };

  const getWorkerName = (id: string | null) => {
    if (!id) return null;
    return workers.find(w => w.id === id)?.full_name;
  };

  const getDayLabel = (day: string | null) => {
    if (!day) return null;
    return DAYS.find(d => d.value === day)?.label;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              إدارة السكتورات
            </DialogTitle>
          </DialogHeader>

          {/* Add/Edit Form */}
          {showForm ? (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">{editingSector ? 'تعديل السكتور' : 'سكتور جديد'}</Label>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetForm}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">اسم السكتور *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: سكتور الشرق" className="text-right" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> يوم زيارة الطلبات</Label>
                  <Select value={visitDaySales} onValueChange={setVisitDaySales}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="اختر اليوم" /></SelectTrigger>
                     <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {DAYS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> يوم التوصيل</Label>
                  <Select value={visitDayDelivery} onValueChange={setVisitDayDelivery}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="اختر اليوم" /></SelectTrigger>
                     <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {DAYS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><UserCheck className="w-3 h-3" /> مندوب المبيعات</Label>
                  <Select value={salesWorkerId} onValueChange={setSalesWorkerId}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                     <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {workers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Truck className="w-3 h-3" /> مندوب التوصيل</Label>
                  <Select value={deliveryWorkerId} onValueChange={setDeliveryWorkerId}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {workers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                {editingSector ? 'حفظ التعديلات' : 'إضافة السكتور'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full border-dashed" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة سكتور جديد
            </Button>
          )}

          {/* Sectors List */}
          <div className="space-y-2 mt-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : sectors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد سكتورات بعد</p>
              </div>
            ) : (
              sectors.map(sector => (
                <Card key={sector.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1.5 flex-1">
                        <p className="font-bold text-sm">{sector.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getDayLabel(sector.visit_day_sales) && (
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              <Calendar className="w-2.5 h-2.5 ml-0.5" />
                              طلبات: {getDayLabel(sector.visit_day_sales)}
                            </Badge>
                          )}
                          {getDayLabel(sector.visit_day_delivery) && (
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              <Truck className="w-2.5 h-2.5 ml-0.5" />
                              توصيل: {getDayLabel(sector.visit_day_delivery)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {getWorkerName(sector.sales_worker_id) && (
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              <UserCheck className="w-2.5 h-2.5 ml-0.5" />
                              {getWorkerName(sector.sales_worker_id)}
                            </Badge>
                          )}
                          {getWorkerName(sector.delivery_worker_id) && (
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              <Truck className="w-2.5 h-2.5 ml-0.5" />
                              {getWorkerName(sector.delivery_worker_id)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(sector)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setSectorToDelete(sector)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!sectorToDelete} onOpenChange={() => setSectorToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف السكتور "{sectorToDelete?.name}"؟ سيتم إلغاء ربط العملاء المرتبطين به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ManageSectorsDialog;
