import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useSectorCoverage, SectorCoverage } from '@/hooks/useSectorCoverage';
import { useSectorSchedules } from '@/hooks/useSectorSchedules';
import { getLocalizedName } from '@/utils/sectorName';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { UserX, UserCheck, ArrowRight, Trash2, Plus, Calendar, Truck, ShoppingCart, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface SectorCoverageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCHEDULE_TYPES = [
  { value: 'delivery', label: 'توصيل', icon: Truck },
  { value: 'sales', label: 'مبيعات', icon: ShoppingCart },
] as const;

const SectorCoverageDialog: React.FC<SectorCoverageDialogProps> = ({ open, onOpenChange }) => {
  const { workerId, activeBranch, role } = useAuth();
  const { language } = useLanguage();
  const { coverages, createCoverage, cancelCoverage, isLoading: coverageLoading } = useSectorCoverage();
  const { schedules } = useSectorSchedules();

  const [tab, setTab] = useState<'create' | 'active'>('active');
  const [absentWorkerId, setAbsentWorkerId] = useState('');
  const [scheduleType, setScheduleType] = useState<'sales' | 'delivery'>('delivery');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Fetch workers
  const { data: workers = [] } = useQuery({
    queryKey: ['coverage-workers', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, username').eq('is_active', true);
      if (activeBranch && role === 'branch_admin') query = query.eq('branch_id', activeBranch.id);
      const { data } = await query.order('full_name');
      return data || [];
    },
    enabled: open,
  });

  // Fetch sectors
  const { data: sectors = [] } = useQuery({
    queryKey: ['coverage-sectors', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('sectors').select('*');
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query.order('name');
      return data || [];
    },
    enabled: open,
  });

  // Get sectors assigned to absent worker for the selected schedule type
  const absentWorkerSectors = useMemo(() => {
    if (!absentWorkerId) return [];
    const workerSchedules = schedules.filter(
      s => s.worker_id === absentWorkerId && s.schedule_type === scheduleType
    );
    const sectorIds = [...new Set(workerSchedules.map(s => s.sector_id))];
    return sectorIds.map(sid => {
      const sector = sectors.find(s => s.id === sid);
      const days = workerSchedules.filter(ws => ws.sector_id === sid).map(ws => ws.day);
      return { sectorId: sid, sectorName: sector ? getLocalizedName(sector, language) : sid, days };
    });
  }, [absentWorkerId, scheduleType, schedules, sectors, language]);

  // Available substitute workers (exclude absent worker)
  const substituteWorkers = useMemo(() => {
    return workers.filter(w => w.id !== absentWorkerId);
  }, [workers, absentWorkerId]);

  const handleAssign = (sectorId: string, substituteId: string) => {
    setAssignments(prev => ({ ...prev, [sectorId]: substituteId }));
  };

  const handleSave = async () => {
    const entries = Object.entries(assignments).filter(([, wId]) => wId);
    if (entries.length === 0) {
      toast.error('يرجى تعيين بديل واحد على الأقل');
      return;
    }
    setSaving(true);
    try {
      for (const [sectorId, substituteId] of entries) {
        await createCoverage({
          sector_id: sectorId,
          absent_worker_id: absentWorkerId,
          substitute_worker_id: substituteId,
          coverage_type: entries.length === 1 && absentWorkerSectors.length === 1 ? 'full' : 'split',
          schedule_type: scheduleType,
          start_date: startDate,
          end_date: endDate,
          reason: reason || undefined,
          created_by: workerId || undefined,
          branch_id: activeBranch?.id || undefined,
        });
      }
      toast.success(`تم إنشاء ${entries.length} تعويض(ات) بنجاح`);
      setAssignments({});
      setAbsentWorkerId('');
      setReason('');
      setTab('active');
    } catch (error) {
      console.error(error);
      toast.error('حدث خطأ أثناء حفظ التعويضات');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelCoverage(id);
      toast.success('تم إلغاء التعويض');
    } catch {
      toast.error('حدث خطأ');
    }
  };

  // Active/upcoming coverages
  const activeCoverages = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return coverages.filter(c => c.is_active && c.end_date >= today);
  }, [coverages]);

  const getWorkerName = (id: string) => workers.find(w => w.id === id)?.full_name || '—';
  const getSectorName = (id: string) => {
    const s = sectors.find(sec => sec.id === id);
    return s ? getLocalizedName(s, language) : '—';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            إدارة التعويضات
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="active" className="flex-1">
              التعويضات النشطة ({activeCoverages.length})
            </TabsTrigger>
            <TabsTrigger value="create" className="flex-1">
              <Plus className="w-4 h-4 ml-1" />
              تعويض جديد
            </TabsTrigger>
          </TabsList>

          {/* Active coverages tab */}
          <TabsContent value="active">
            <ScrollArea className="h-[50vh]">
              {coverageLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : activeCoverages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>لا توجد تعويضات نشطة</p>
                </div>
              ) : (
                <div className="space-y-3 p-1">
                  {activeCoverages.map(c => (
                    <Card key={c.id} className="border-border">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {c.schedule_type === 'delivery' ? '🚚 توصيل' : '🛒 مبيعات'}
                          </Badge>
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(c.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="text-sm font-medium">{getSectorName(c.sector_id)}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <UserX className="w-3 h-3" />
                          <span>{getWorkerName(c.absent_worker_id)}</span>
                          <ArrowRight className="w-3 h-3" />
                          <UserCheck className="w-3 h-3 text-primary" />
                          <span className="text-primary font-medium">{getWorkerName(c.substitute_worker_id)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{c.start_date} → {c.end_date}</span>
                        </div>
                        {c.reason && (
                          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                            {c.reason}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Create coverage tab */}
          <TabsContent value="create">
            <ScrollArea className="h-[50vh]">
              <div className="space-y-4 p-1">
                {/* Schedule type */}
                <div className="space-y-1">
                  <Label>نوع المهمة</Label>
                  <div className="flex gap-2">
                    {SCHEDULE_TYPES.map(st => (
                      <Button
                        key={st.value}
                        variant={scheduleType === st.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setScheduleType(st.value); setAbsentWorkerId(''); setAssignments({}); }}
                        className="flex-1"
                      >
                        <st.icon className="w-4 h-4 ml-1" />
                        {st.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Absent worker */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-1">
                    <UserX className="w-4 h-4" />
                    العامل الغائب
                  </Label>
                  <Select value={absentWorkerId} onValueChange={v => { setAbsentWorkerId(v); setAssignments({}); }}>
                    <SelectTrigger><SelectValue placeholder="اختر العامل الغائب" /></SelectTrigger>
                    <SelectContent>
                      {workers.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>من تاريخ</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>إلى تاريخ</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-1">
                  <Label>السبب (اختياري)</Label>
                  <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="مثلاً: إجازة مرضية" />
                </div>

                {/* Sector assignments */}
                {absentWorkerId && absentWorkerSectors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <UserCheck className="w-4 h-4 text-primary" />
                      تعيين البدلاء للسيكتورات
                    </Label>
                    <div className="space-y-2">
                      {absentWorkerSectors.map(s => (
                        <Card key={s.sectorId} className="border-border">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{s.sectorName}</span>
                              <div className="flex gap-1">
                                {s.days.map(d => (
                                  <Badge key={d} variant="secondary" className="text-[10px]">
                                    {d === 'saturday' ? 'سب' : d === 'sunday' ? 'أح' : d === 'monday' ? 'إث' : d === 'tuesday' ? 'ثل' : d === 'wednesday' ? 'أر' : 'خم'}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Select value={assignments[s.sectorId] || ''} onValueChange={v => handleAssign(s.sectorId, v)}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="اختر البديل" />
                              </SelectTrigger>
                              <SelectContent>
                                {substituteWorkers.map(w => (
                                  <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {absentWorkerId && absentWorkerSectors.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">لا توجد سيكتورات مجدولة لهذا العامل ({scheduleType === 'delivery' ? 'توصيل' : 'مبيعات'})</p>
                  </div>
                )}

                {/* Save button */}
                <Button
                  onClick={handleSave}
                  disabled={saving || Object.keys(assignments).length === 0}
                  className="w-full"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  حفظ التعويضات
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SectorCoverageDialog;
