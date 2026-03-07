import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, ArrowLeftRight, Merge, Save, Calendar, Truck, ShoppingCart, AlertTriangle, Users } from 'lucide-react';
import { getLocalizedName } from '@/utils/sectorName';

const DAYS_ORDER = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_LABELS: Record<string, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
};

const JS_DAY_MAP: Record<number, string> = {
  6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday',
};

function getWeekStart(refDate: Date): Date {
  const d = new Date(refDate);
  const jsDay = d.getDay();
  const diff = jsDay === 6 ? 0 : jsDay + 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTargetWeekStart(targetDay: string): string {
  const today = new Date();
  const todayName = JS_DAY_MAP[today.getDay()];
  const todayIdx = DAYS_ORDER.indexOf(todayName || '');
  const targetIdx = DAYS_ORDER.indexOf(targetDay);
  const weekStart = getWeekStart(today);
  if (targetIdx < todayIdx) {
    weekStart.setDate(weekStart.getDate() + 7);
  }
  return weekStart.toISOString().split('T')[0];
}

interface SectorScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
  workerType: 'delivery' | 'sales';
}

interface ConflictInfo {
  targetDay: string;
  newSectorId: string;
  newSectorName: string;
  existingSectorId: string;
  existingSectorName: string;
  existingDay: string;
}

interface CrossWorkerConflictInfo {
  targetDay: string;
  sectorId: string;
  sectorName: string;
  otherWorkerId: string;
  otherWorkerName: string;
  otherWorkerSectorDay: string; // the day this sector is assigned to other worker
  currentWorkerSectorId?: string; // the sector currently assigned to current worker on targetDay
  currentWorkerSectorName?: string;
}

const SectorScheduleDialog: React.FC<SectorScheduleDialogProps> = ({
  open, onOpenChange, workerId, workerName, workerType,
}) => {
  const { activeBranch, workerId: currentWorkerId } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [crossWorkerConflict, setCrossWorkerConflict] = useState<CrossWorkerConflictInfo | null>(null);
  const [saving, setSaving] = useState(false);

  const workerField = workerType === 'delivery' ? 'delivery_worker_id' : 'sales_worker_id';
  const dayField = workerType === 'delivery' ? 'visit_day_delivery' : 'visit_day_sales';

  // Fetch all sectors for the branch
  const { data: allSectors = [] } = useQuery({
    queryKey: ['sector-schedule-all', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('sectors').select('*').order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data } = await q;
      return data || [];
    },
    enabled: open,
  });

  // Fetch sector_schedules for multi-schedule support
  const { data: allSchedules = [] } = useQuery({
    queryKey: ['sector-schedule-schedules', activeBranch?.id],
    queryFn: async () => {
      const { data } = await supabase.from('sector_schedules').select('*');
      return data || [];
    },
    enabled: open,
  });

  // Fetch workers for cross-worker conflict display
  const { data: allWorkers = [] } = useQuery({
    queryKey: ['sector-schedule-workers', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('workers').select('id, full_name').eq('is_active', true);
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data } = await q;
      return data || [];
    },
    enabled: open,
  });

  // Fetch active overrides for this worker
  const { data: overrides = [] } = useQuery({
    queryKey: ['sector-schedule-overrides', workerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sector_schedule_overrides')
        .select('*')
        .eq('worker_id', workerId!)
        .eq('worker_type', workerType);
      return data || [];
    },
    enabled: open && !!workerId,
  });

  // Build effective schedule: base from sectors table + overrides
  const effectiveSchedule = useMemo(() => {
    const schedule: Record<string, { sectorId: string; sectorName: string; isOverride?: boolean }[]> = {};
    for (const day of DAYS_ORDER) {
      schedule[day] = [];
    }

    const workerSectors = allSectors.filter((s: any) => s[workerField] === workerId);
    for (const s of workerSectors) {
      const day = (s as any)[dayField];
      if (day && schedule[day]) {
        schedule[day].push({ sectorId: s.id, sectorName: getLocalizedName(s, language) });
      }
    }

    const today = new Date();
    const currentWeekStart = getWeekStart(today).toISOString().split('T')[0];

    for (const ov of overrides as any[]) {
      if (ov.is_permanent) continue;
      if (ov.week_start === currentWeekStart) {
        schedule[ov.original_day] = schedule[ov.original_day]?.filter(
          (x) => x.sectorId !== ov.sector_id
        ) || [];
        if (schedule[ov.new_day]) {
          const sector = allSectors.find((s: any) => s.id === ov.sector_id);
          schedule[ov.new_day].push({
            sectorId: ov.sector_id,
            sectorName: sector ? getLocalizedName(sector, language) : ov.sector_id,
            isOverride: true,
          });
        }
      }
    }

    return schedule;
  }, [allSectors, overrides, workerId, workerField, dayField, language]);

  const getAvailableSectors = useCallback((day: string) => {
    const assignedIds = effectiveSchedule[day]?.map((s) => s.sectorId) || [];
    return allSectors.filter((s: any) => !assignedIds.includes(s.id));
  }, [allSectors, effectiveSchedule]);

  const getWorkerName = useCallback((wId: string) => {
    return allWorkers.find((w: any) => w.id === wId)?.full_name || 'عامل آخر';
  }, [allWorkers]);

  const handleAssignSector = (day: string) => {
    if (!selectedSectorId) return;

    const newSector = allSectors.find((s: any) => s.id === selectedSectorId);
    if (!newSector) return;
    const newSectorName = getLocalizedName(newSector, language);

    // Check if this sector belongs to ANOTHER worker
    const otherWorkerId = (newSector as any)[workerField];
    if (otherWorkerId && otherWorkerId !== workerId) {
      const otherWorkerSectorDay = (newSector as any)[dayField] || '';
      const existingOnTarget = effectiveSchedule[day]?.[0];

      setCrossWorkerConflict({
        targetDay: day,
        sectorId: selectedSectorId,
        sectorName: newSectorName,
        otherWorkerId,
        otherWorkerName: getWorkerName(otherWorkerId),
        otherWorkerSectorDay,
        currentWorkerSectorId: existingOnTarget?.sectorId,
        currentWorkerSectorName: existingOnTarget?.sectorName,
      });
      setEditingDay(null);
      setSelectedSectorId('');
      return;
    }

    // Check if this sector is already assigned to another day for this worker (same-worker conflict)
    let existingDay: string | null = null;
    for (const [d, sectors] of Object.entries(effectiveSchedule)) {
      if (d !== day && sectors.some((s) => s.sectorId === selectedSectorId)) {
        existingDay = d;
        break;
      }
    }

    const existingOnTarget = effectiveSchedule[day]?.[0];

    if (existingDay && existingOnTarget) {
      setConflict({
        targetDay: day,
        newSectorId: selectedSectorId,
        newSectorName: newSectorName,
        existingSectorId: existingOnTarget.sectorId,
        existingSectorName: existingOnTarget.sectorName,
        existingDay: existingDay,
      });
    } else {
      handleSaveChange(day, selectedSectorId, 'assign');
    }

    setEditingDay(null);
    setSelectedSectorId('');
  };

  const handleConflictResolve = (resolution: 'swap' | 'merge') => {
    if (!conflict) return;
    handleSaveChange(conflict.targetDay, conflict.newSectorId, resolution, conflict);
    setConflict(null);
  };

  // Cross-worker swap: permanent
  const handleCrossWorkerSwapPermanent = async () => {
    if (!crossWorkerConflict || !workerId || !currentWorkerId) return;
    setSaving(true);
    try {
      const { sectorId, targetDay, otherWorkerId, currentWorkerSectorId } = crossWorkerConflict;

      // Assign the sector to current worker
      await supabase.from('sectors').update({
        [workerField]: workerId,
        [dayField]: targetDay,
      }).eq('id', sectorId);

      // If current worker had a sector on that day, assign it to the other worker
      if (currentWorkerSectorId) {
        const currentSector = allSectors.find((s: any) => s.id === currentWorkerSectorId);
        const currentSectorDay = (currentSector as any)?.[dayField] || targetDay;
        await supabase.from('sectors').update({
          [workerField]: otherWorkerId,
          [dayField]: currentSectorDay,
        }).eq('id', currentWorkerSectorId);
      }

      // Record overrides
      const weekStart = getTargetWeekStart(targetDay);
      const sector = allSectors.find((s: any) => s.id === sectorId);
      await supabase.from('sector_schedule_overrides').insert({
        sector_id: sectorId,
        worker_id: workerId,
        worker_type: workerType,
        original_day: (sector as any)?.[dayField] || '',
        new_day: targetDay,
        week_start: weekStart,
        is_permanent: true,
        created_by: currentWorkerId,
        branch_id: activeBranch?.id || null,
      });

      toast.success('تم الاستبدال بين العاملين بنجاح');
      queryClient.invalidateQueries({ queryKey: ['sector-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['worker-actions-sectors'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ');
      console.error(error);
    } finally {
      setSaving(false);
      setCrossWorkerConflict(null);
    }
  };

  // Cross-worker swap: weekly
  const handleCrossWorkerSwapWeekly = async () => {
    if (!crossWorkerConflict || !workerId || !currentWorkerId) return;
    setSaving(true);
    try {
      const { sectorId, targetDay, otherWorkerId, currentWorkerSectorId } = crossWorkerConflict;
      const weekStart = getTargetWeekStart(targetDay);
      const sector = allSectors.find((s: any) => s.id === sectorId);

      const inserts: any[] = [{
        sector_id: sectorId,
        worker_id: workerId,
        worker_type: workerType,
        original_day: (sector as any)?.[dayField] || '',
        new_day: targetDay,
        week_start: weekStart,
        is_permanent: false,
        created_by: currentWorkerId,
        branch_id: activeBranch?.id || null,
      }];

      if (currentWorkerSectorId) {
        const currentSector = allSectors.find((s: any) => s.id === currentWorkerSectorId);
        inserts.push({
          sector_id: currentWorkerSectorId,
          worker_id: otherWorkerId,
          worker_type: workerType,
          original_day: (currentSector as any)?.[dayField] || targetDay,
          new_day: (currentSector as any)?.[dayField] || targetDay,
          week_start: weekStart,
          is_permanent: false,
          created_by: currentWorkerId,
          branch_id: activeBranch?.id || null,
        });
      }

      await supabase.from('sector_schedule_overrides').insert(inserts);
      toast.success('تم الحفظ الأسبوعي - سيعود للوضع المعتاد الأسبوع القادم');
      queryClient.invalidateQueries({ queryKey: ['sector-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['worker-actions-sectors'] });
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ');
      console.error(error);
    } finally {
      setSaving(false);
      setCrossWorkerConflict(null);
    }
  };

  const handleSaveChange = async (
    targetDay: string,
    sectorId: string,
    mode: 'assign' | 'swap' | 'merge',
    conflictInfo?: ConflictInfo,
  ) => {
    if (!workerId || !currentWorkerId) return;
    setSaving(true);

    try {
      const weekStart = getTargetWeekStart(targetDay);
      const sector = allSectors.find((s: any) => s.id === sectorId);
      const originalDay = (sector as any)?.[dayField] || '';

      if (mode === 'swap' && conflictInfo) {
        await supabase.from('sectors').update({ [dayField]: conflictInfo.targetDay }).eq('id', sectorId);
        await supabase.from('sectors').update({ [dayField]: conflictInfo.existingDay }).eq('id', conflictInfo.existingSectorId);
        toast.success('تم الاستبدال بنجاح');
      } else if (mode === 'merge' && conflictInfo) {
        await supabase.from('sectors').update({ [dayField]: conflictInfo.targetDay }).eq('id', sectorId);
        toast.success('تم الدمج بنجاح');
      } else {
        await supabase.from('sectors').update({ [dayField]: targetDay }).eq('id', sectorId);
        toast.success('تم التعيين بنجاح');
      }

      await supabase.from('sector_schedule_overrides').insert({
        sector_id: sectorId,
        worker_id: workerId,
        worker_type: workerType,
        original_day: originalDay,
        new_day: targetDay,
        week_start: weekStart,
        is_permanent: true,
        created_by: currentWorkerId,
        branch_id: activeBranch?.id || null,
      });

      queryClient.invalidateQueries({ queryKey: ['sector-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['worker-actions-sectors'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleWeeklySave = async (targetDay: string, sectorId: string, mode: 'assign' | 'swap' | 'merge', conflictInfo?: ConflictInfo) => {
    if (!workerId || !currentWorkerId) return;
    setSaving(true);

    try {
      const weekStart = getTargetWeekStart(targetDay);
      const sector = allSectors.find((s: any) => s.id === sectorId);
      const originalDay = (sector as any)?.[dayField] || '';

      const inserts: any[] = [{
        sector_id: sectorId,
        worker_id: workerId,
        worker_type: workerType,
        original_day: originalDay,
        new_day: targetDay,
        week_start: weekStart,
        is_permanent: false,
        created_by: currentWorkerId,
        branch_id: activeBranch?.id || null,
      }];

      if (mode === 'swap' && conflictInfo) {
        inserts.push({
          sector_id: conflictInfo.existingSectorId,
          worker_id: workerId,
          worker_type: workerType,
          original_day: conflictInfo.targetDay,
          new_day: conflictInfo.existingDay,
          week_start: weekStart,
          is_permanent: false,
          created_by: currentWorkerId,
          branch_id: activeBranch?.id || null,
        });
      }

      await supabase.from('sector_schedule_overrides').insert(inserts);
      toast.success('تم الحفظ الأسبوعي بنجاح - سيعود للوضع المعتاد الأسبوع القادم');

      queryClient.invalidateQueries({ queryKey: ['sector-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['worker-actions-sectors'] });
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-5 h-5 text-primary" />
              جدول السيكتورات - {workerName}
              <Badge variant="outline" className="text-[10px]">
                {workerType === 'delivery' ? 'توصيل' : 'طلبيات'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh]">
            <div className="space-y-2 p-1">
              {DAYS_ORDER.map((day) => {
                const sectors = effectiveSchedule[day] || [];
                const isEditing = editingDay === day;

                return (
                  <div key={day} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{DAY_LABELS[day]}</span>
                      </div>
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { setEditingDay(day); setSelectedSectorId(''); }}
                        >
                          تعديل
                        </Button>
                      )}
                    </div>

                    {sectors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {sectors.map((s) => (
                          <Badge
                            key={s.sectorId}
                            variant={s.isOverride ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {workerType === 'delivery' ? (
                              <Truck className="w-3 h-3 ml-1" />
                            ) : (
                              <ShoppingCart className="w-3 h-3 ml-1" />
                            )}
                            {s.sectorName}
                            {s.isOverride && <span className="mr-1 text-[9px]">(مؤقت)</span>}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">لا يوجد سيكتور</p>
                    )}

                    {isEditing && (
                      <div className="flex items-center gap-2 pt-1 border-t">
                        <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="اختر سيكتور" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableSectors(day).map((s: any) => {
                              const owner = s[workerField];
                              const ownerName = owner && owner !== workerId ? getWorkerName(owner) : null;
                              return (
                                <SelectItem key={s.id} value={s.id} className="text-xs">
                                  {getLocalizedName(s, language)}
                                  {ownerName && <span className="text-muted-foreground mr-1">({ownerName})</span>}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!selectedSectorId || saving}
                          onClick={() => handleAssignSector(day)}
                        >
                          <Save className="w-3 h-3 ml-1" />
                          تعيين
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => { setEditingDay(null); setSelectedSectorId(''); }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Same-worker Conflict Resolution Dialog */}
      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              تعارض في الجدول
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>
                السيكتور <strong>{conflict?.newSectorName}</strong> مبرمج حالياً يوم{' '}
                <strong>{DAY_LABELS[conflict?.existingDay || '']}</strong>.
              </p>
              <p>
                يوم <strong>{DAY_LABELS[conflict?.targetDay || '']}</strong> يحتوي على السيكتور{' '}
                <strong>{conflict?.existingSectorName}</strong>.
              </p>
              <p className="font-semibold mt-3">اختر طريقة المعالجة:</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 my-2">
            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-blue-700 dark:text-blue-300">
                <ArrowLeftRight className="w-4 h-4" />
                استبدال
              </div>
              <p className="text-xs text-muted-foreground">
                {conflict?.newSectorName} ← {DAY_LABELS[conflict?.targetDay || '']}
                {' | '}
                {conflict?.existingSectorName} ← {DAY_LABELS[conflict?.existingDay || '']}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs flex-1" disabled={saving}
                  onClick={() => { if (conflict) handleWeeklySave(conflict.targetDay, conflict.newSectorId, 'swap', conflict); setConflict(null); }}>
                  <Calendar className="w-3 h-3 ml-1" />حفظ أسبوعي
                </Button>
                <Button size="sm" className="text-xs flex-1" disabled={saving}
                  onClick={() => handleConflictResolve('swap')}>
                  <Save className="w-3 h-3 ml-1" />حفظ دائم
                </Button>
              </div>
            </div>
            <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-emerald-700 dark:text-emerald-300">
                <Merge className="w-4 h-4" />
                دمج
              </div>
              <p className="text-xs text-muted-foreground">
                {conflict?.newSectorName} + {conflict?.existingSectorName} ← {DAY_LABELS[conflict?.targetDay || '']}
                {' | '}{DAY_LABELS[conflict?.existingDay || '']} يصبح فارغاً
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs flex-1" disabled={saving}
                  onClick={() => { if (conflict) handleWeeklySave(conflict.targetDay, conflict.newSectorId, 'merge', conflict); setConflict(null); }}>
                  <Calendar className="w-3 h-3 ml-1" />حفظ أسبوعي
                </Button>
                <Button size="sm" className="text-xs flex-1" disabled={saving}
                  onClick={() => handleConflictResolve('merge')}>
                  <Save className="w-3 h-3 ml-1" />حفظ دائم
                </Button>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cross-worker Conflict Resolution Dialog */}
      <AlertDialog open={!!crossWorkerConflict} onOpenChange={(o) => !o && setCrossWorkerConflict(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-500" />
              تعارض بين العاملين
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>
                السيكتور <strong>{crossWorkerConflict?.sectorName}</strong> مسجّل حالياً للعامل{' '}
                <strong>{crossWorkerConflict?.otherWorkerName}</strong>
                {crossWorkerConflict?.otherWorkerSectorDay && (
                  <> يوم <strong>{DAY_LABELS[crossWorkerConflict.otherWorkerSectorDay] || crossWorkerConflict.otherWorkerSectorDay}</strong></>
                )}.
              </p>
              {crossWorkerConflict?.currentWorkerSectorName && (
                <p>
                  {workerName} لديه حالياً السيكتور <strong>{crossWorkerConflict.currentWorkerSectorName}</strong> يوم{' '}
                  <strong>{DAY_LABELS[crossWorkerConflict.targetDay]}</strong>.
                </p>
              )}
              <p className="font-semibold mt-3">اختر طريقة المعالجة:</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 my-2">
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-orange-700 dark:text-orange-300">
                <ArrowLeftRight className="w-4 h-4" />
                استبدال بين العاملين
              </div>
              <p className="text-xs text-muted-foreground">
                {workerName} ← {crossWorkerConflict?.sectorName} ({DAY_LABELS[crossWorkerConflict?.targetDay || '']})
                {crossWorkerConflict?.currentWorkerSectorName && (
                  <>
                    {' | '}
                    {crossWorkerConflict.otherWorkerName} ← {crossWorkerConflict.currentWorkerSectorName}
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs flex-1" disabled={saving}
                  onClick={handleCrossWorkerSwapWeekly}>
                  <Calendar className="w-3 h-3 ml-1" />حفظ أسبوعي
                </Button>
                <Button size="sm" className="text-xs flex-1" disabled={saving}
                  onClick={handleCrossWorkerSwapPermanent}>
                  <Save className="w-3 h-3 ml-1" />حفظ دائم
                </Button>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SectorScheduleDialog;
