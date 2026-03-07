import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, ArrowLeftRight, Merge, Save, Calendar, Truck, ShoppingCart, AlertTriangle } from 'lucide-react';
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

// Get the Saturday start of the current business week (Sat-Thu)
function getWeekStart(refDate: Date): Date {
  const d = new Date(refDate);
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  // Days since last Saturday: if today is Sat(6)->0, Sun(0)->1, Mon(1)->2, ..., Fri(5)->6
  const diff = jsDay === 6 ? 0 : jsDay + 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Determine which week_start a change to targetDay should apply to
function getTargetWeekStart(targetDay: string): string {
  const today = new Date();
  const todayName = JS_DAY_MAP[today.getDay()];
  const todayIdx = DAYS_ORDER.indexOf(todayName || '');
  const targetIdx = DAYS_ORDER.indexOf(targetDay);

  const weekStart = getWeekStart(today);

  // If the target day has already passed this week, apply to next week
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

const SectorScheduleDialog: React.FC<SectorScheduleDialogProps> = ({
  open, onOpenChange, workerId, workerName, workerType,
}) => {
  const { activeBranch, workerId: currentWorkerId } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
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

    // Base schedule from sectors
    const workerSectors = allSectors.filter((s: any) => s[workerField] === workerId);
    for (const s of workerSectors) {
      const day = (s as any)[dayField];
      if (day && schedule[day]) {
        schedule[day].push({ sectorId: s.id, sectorName: getLocalizedName(s, language) });
      }
    }

    // Apply active weekly overrides (non-permanent, matching current week)
    const today = new Date();
    const currentWeekStart = getWeekStart(today).toISOString().split('T')[0];

    for (const ov of overrides as any[]) {
      if (ov.is_permanent) {
        // Permanent: already reflected in sectors table after save
        continue;
      }
      // Weekly override: check if it's for the relevant week
      if (ov.week_start === currentWeekStart) {
        // Remove from original day
        schedule[ov.original_day] = schedule[ov.original_day]?.filter(
          (x) => x.sectorId !== ov.sector_id
        ) || [];
        // Add to new day
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

  // Available sectors that can be assigned (not already assigned to this worker on that day)
  const getAvailableSectors = useCallback((day: string) => {
    const assignedIds = effectiveSchedule[day]?.map((s) => s.sectorId) || [];
    return allSectors.filter((s: any) => !assignedIds.includes(s.id));
  }, [allSectors, effectiveSchedule]);

  const handleAssignSector = (day: string) => {
    if (!selectedSectorId) return;

    const newSector = allSectors.find((s: any) => s.id === selectedSectorId);
    if (!newSector) return;
    const newSectorName = getLocalizedName(newSector, language);

    // Check if this sector is already assigned to another day for this worker
    let existingDay: string | null = null;
    for (const [d, sectors] of Object.entries(effectiveSchedule)) {
      if (d !== day && sectors.some((s) => s.sectorId === selectedSectorId)) {
        existingDay = d;
        break;
      }
    }

    // Check if there's already a sector on the target day
    const existingOnTarget = effectiveSchedule[day]?.[0];

    if (existingDay && existingOnTarget) {
      // Conflict: sector is on another day AND target day already has a sector
      setConflict({
        targetDay: day,
        newSectorId: selectedSectorId,
        newSectorName: newSectorName,
        existingSectorId: existingOnTarget.sectorId,
        existingSectorName: existingOnTarget.sectorName,
        existingDay: existingDay,
      });
    } else {
      // No conflict - just assign
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

  const handleSaveChange = async (
    targetDay: string,
    sectorId: string,
    mode: 'assign' | 'swap' | 'merge',
    conflictInfo?: ConflictInfo,
  ) => {
    if (!workerId || !currentWorker) return;
    setSaving(true);

    try {
      const weekStart = getTargetWeekStart(targetDay);
      const sector = allSectors.find((s: any) => s.id === sectorId);
      const originalDay = (sector as any)?.[dayField] || '';

      if (mode === 'swap' && conflictInfo) {
        // Swap: move new sector to target day, move existing sector to new sector's original day
        // Save as permanent updates to sectors table
        await supabase.from('sectors').update({ [dayField]: conflictInfo.targetDay }).eq('id', sectorId);
        await supabase.from('sectors').update({ [dayField]: conflictInfo.existingDay }).eq('id', conflictInfo.existingSectorId);
        toast.success('تم الاستبدال بنجاح');
      } else if (mode === 'merge' && conflictInfo) {
        // Merge: both sectors on target day, original day empty
        await supabase.from('sectors').update({ [dayField]: conflictInfo.targetDay }).eq('id', sectorId);
        // Existing sector stays on target day - no change needed
        // Clear the original day of the moved sector (it's already moved)
        toast.success('تم الدمج بنجاح');
      } else {
        // Simple assign - update sector day directly
        await supabase.from('sectors').update({ [dayField]: targetDay }).eq('id', sectorId);
        toast.success('تم التعيين بنجاح');
      }

      // Also record override for weekly tracking
      await supabase.from('sector_schedule_overrides').insert({
        sector_id: sectorId,
        worker_id: workerId,
        worker_type: workerType,
        original_day: originalDay,
        new_day: targetDay,
        week_start: weekStart,
        is_permanent: true,
        created_by: currentWorker.id,
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
    if (!workerId || !currentWorker) return;
    setSaving(true);

    try {
      const weekStart = getTargetWeekStart(targetDay);
      const sector = allSectors.find((s: any) => s.id === sectorId);
      const originalDay = (sector as any)?.[dayField] || '';

      // Insert weekly override(s) without modifying sectors table
      const inserts: any[] = [{
        sector_id: sectorId,
        worker_id: workerId,
        worker_type: workerType,
        original_day: originalDay,
        new_day: targetDay,
        week_start: weekStart,
        is_permanent: false,
        created_by: currentWorker.id,
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
          created_by: currentWorker.id,
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
                            {getAvailableSectors(day).map((s: any) => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {getLocalizedName(s, language)}
                              </SelectItem>
                            ))}
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

      {/* Conflict Resolution Dialog */}
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
            {/* Swap option */}
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
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs flex-1"
                  disabled={saving}
                  onClick={() => {
                    if (conflict) handleWeeklySave(conflict.targetDay, conflict.newSectorId, 'swap', conflict);
                    setConflict(null);
                  }}
                >
                  <Calendar className="w-3 h-3 ml-1" />
                  حفظ أسبوعي
                </Button>
                <Button
                  size="sm"
                  className="text-xs flex-1"
                  disabled={saving}
                  onClick={() => handleConflictResolve('swap')}
                >
                  <Save className="w-3 h-3 ml-1" />
                  حفظ دائم
                </Button>
              </div>
            </div>

            {/* Merge option */}
            <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-emerald-700 dark:text-emerald-300">
                <Merge className="w-4 h-4" />
                دمج
              </div>
              <p className="text-xs text-muted-foreground">
                {conflict?.newSectorName} + {conflict?.existingSectorName} ← {DAY_LABELS[conflict?.targetDay || '']}
                {' | '}
                {DAY_LABELS[conflict?.existingDay || '']} يصبح فارغاً
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs flex-1"
                  disabled={saving}
                  onClick={() => {
                    if (conflict) handleWeeklySave(conflict.targetDay, conflict.newSectorId, 'merge', conflict);
                    setConflict(null);
                  }}
                >
                  <Calendar className="w-3 h-3 ml-1" />
                  حفظ أسبوعي
                </Button>
                <Button
                  size="sm"
                  className="text-xs flex-1"
                  disabled={saving}
                  onClick={() => handleConflictResolve('merge')}
                >
                  <Save className="w-3 h-3 ml-1" />
                  حفظ دائم
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
