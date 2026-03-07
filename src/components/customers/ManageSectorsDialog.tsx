import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MapPin, Plus, Pencil, Trash2, Loader2, Save, X, UserCheck, Truck, Calendar, Layers, Languages, Filter } from 'lucide-react';
import { useSectors } from '@/hooks/useSectors';
import { useSectorSchedules, SectorSchedule } from '@/hooks/useSectorSchedules';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sector, SectorType } from '@/types/database';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { autoTranslateBeforeSave } from '@/components/translation/TranslatableInput';
import { Switch } from '@/components/ui/switch';

interface ManageSectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SectorZone {
  id: string;
  name: string;
  name_fr?: string | null;
  sector_id: string;
}

interface FormScheduleEntry {
  schedule_type: 'sales' | 'delivery';
  day: string;
  worker_id: string;
}

const DAYS = [
  { value: 'saturday', label: 'السبت', order: 0 },
  { value: 'sunday', label: 'الأحد', order: 1 },
  { value: 'monday', label: 'الاثنين', order: 2 },
  { value: 'tuesday', label: 'الثلاثاء', order: 3 },
  { value: 'wednesday', label: 'الأربعاء', order: 4 },
  { value: 'thursday', label: 'الخميس', order: 5 },
];

const DAY_ORDER: Record<string, number> = {
  saturday: 0, sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5,
};

const ManageSectorsDialog: React.FC<ManageSectorsDialogProps> = ({ open, onOpenChange }) => {
  const { workerId, activeBranch } = useAuth();
  const { sectors, isLoading, createSector, updateSector, deleteSector } = useSectors();
  const { schedules, saveSectorSchedules, getSchedulesBySector } = useSectorSchedules();
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [sectorToDelete, setSectorToDelete] = useState<Sector | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [sectorType, setSectorType] = useState<SectorType>('prevente');

  // Multi-schedule form state
  const [formSchedules, setFormSchedules] = useState<FormScheduleEntry[]>([]);

  // Zone management state
  const [zonesMap, setZonesMap] = useState<Record<string, SectorZone[]>>({});
  const [expandedZonesSector, setExpandedZonesSector] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneNameFr, setNewZoneNameFr] = useState('');
  const [addingZone, setAddingZone] = useState(false);
  const [formZones, setFormZones] = useState<{ name: string; name_fr: string }[]>([]);
  const [newFormZone, setNewFormZone] = useState('');
  const [newFormZoneFr, setNewFormZoneFr] = useState('');
  const [translatingName, setTranslatingName] = useState(false);
  const [translatingZone, setTranslatingZone] = useState(false);

  // Filter state
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [filterType, setFilterType] = useState<'all' | 'prevente' | 'cash_van'>('all');

  // Build schedules map for display
  const schedulesMap = useMemo(() => {
    const map: Record<string, SectorSchedule[]> = {};
    schedules.forEach(s => {
      if (!map[s.sector_id]) map[s.sector_id] = [];
      map[s.sector_id].push(s);
    });
    return map;
  }, [schedules]);

  const filteredSectors = sectors.filter(s => {
    if (filterType !== 'all' && (s as any).sector_type !== filterType) return false;
    const sectorSchedules = schedulesMap[s.id] || [];
    if (filterDay !== 'all' && !sectorSchedules.some(sc => sc.day === filterDay)) return false;
    if (filterWorker !== 'all' && !sectorSchedules.some(sc => sc.worker_id === filterWorker)) return false;
    return true;
  });

  const getSectorDayOrder = (s: Sector) => {
    const sectorSchedules = schedulesMap[s.id] || [];
    if (sectorSchedules.length === 0) return 99;
    return Math.min(...sectorSchedules.map(sc => DAY_ORDER[sc.day] ?? 99));
  };

  const sortedFilteredSectors = [...filteredSectors].sort((a, b) => getSectorDayOrder(a) - getSectorDayOrder(b));

  const isFiltered = filterType !== 'all' || filterDay !== 'all' || filterWorker !== 'all';
  const groupedByDay = !isFiltered ? DAYS.map(day => ({
    day,
    sectors: filteredSectors.filter(s => {
      const sectorSchedules = schedulesMap[s.id] || [];
      return sectorSchedules.some(sc => sc.day === day.value);
    }),
  })).filter(g => g.sectors.length > 0) : null;

  useEffect(() => {
    if (open) {
      fetchWorkers();
      fetchAllZones();
    }
  }, [open, activeBranch]);

  const fetchWorkers = async () => {
    let query = supabase.from('workers_safe').select('id, full_name').eq('is_active', true);
    if (activeBranch) query = query.eq('branch_id', activeBranch.id);
    const { data } = await query;
    setWorkers((data || []).map(w => ({ id: w.id!, full_name: w.full_name! })));
  };

  const fetchAllZones = async () => {
    const { data } = await supabase.from('sector_zones').select('id, name, name_fr, sector_id').order('name');
    if (data) {
      const map: Record<string, SectorZone[]> = {};
      data.forEach(z => {
        if (!map[z.sector_id]) map[z.sector_id] = [];
        map[z.sector_id].push(z);
      });
      setZonesMap(map);
    }
  };

  const resetForm = () => {
    setName('');
    setNameFr('');
    setSectorType('prevente');
    setFormSchedules([]);
    setEditingSector(null);
    setShowForm(false);
    setFormZones([]);
    setNewFormZone('');
    setNewFormZoneFr('');
  };

  const openEditForm = (sector: Sector) => {
    setEditingSector(sector);
    setName(sector.name);
    setNameFr((sector as any).name_fr || '');
    setSectorType((sector as any).sector_type || 'prevente');
    // Load existing schedules into form
    const existing = schedulesMap[sector.id] || [];
    setFormSchedules(existing.map(s => ({
      schedule_type: s.schedule_type as 'sales' | 'delivery',
      day: s.day,
      worker_id: s.worker_id || '',
    })));
    setFormZones((zonesMap[sector.id] || []).map(z => ({ name: z.name, name_fr: z.name_fr || '' })));
    setShowForm(true);
  };

  const handleAddScheduleEntry = () => {
    setFormSchedules(prev => [...prev, { schedule_type: 'delivery', day: '', worker_id: '' }]);
  };

  const handleRemoveScheduleEntry = (index: number) => {
    setFormSchedules(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateScheduleEntry = (index: number, field: keyof FormScheduleEntry, value: string) => {
    setFormSchedules(prev => prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
  };

  const handleTranslateSectorName = async () => {
    if (!name.trim() && !nameFr.trim()) return;
    setTranslatingName(true);
    try {
      const result = await autoTranslateBeforeSave(name, nameFr, '', 'transliterate');
      if (result.fr && !nameFr.trim()) setNameFr(result.fr);
      if (result.ar && !name.trim()) setName(result.ar);
    } catch { /* silent */ }
    setTranslatingName(false);
  };

  const handleTranslateZoneName = async () => {
    if (!newFormZone.trim() && !newFormZoneFr.trim()) return;
    setTranslatingZone(true);
    try {
      const result = await autoTranslateBeforeSave(newFormZone, newFormZoneFr, '', 'transliterate');
      if (result.fr && !newFormZoneFr.trim()) setNewFormZoneFr(result.fr);
      if (result.ar && !newFormZone.trim()) setNewFormZone(result.ar);
    } catch { /* silent */ }
    setTranslatingZone(false);
  };

  const handleAddFormZone = () => {
    const trimmedAr = newFormZone.trim();
    if (!trimmedAr) return;
    if (formZones.some(z => z.name === trimmedAr)) {
      toast.error('هذه المنطقة موجودة بالفعل');
      return;
    }
    setFormZones(prev => [...prev, { name: trimmedAr, name_fr: newFormZoneFr.trim() }]);
    setNewFormZone('');
    setNewFormZoneFr('');
  };

  const handleRemoveFormZone = (zoneName: string) => {
    setFormZones(prev => prev.filter(z => z.name !== zoneName));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('الرجاء إدخال اسم السكتور');
      return;
    }

    // Validate schedules: check for duplicate (type, day) entries
    const seen = new Set<string>();
    for (const entry of formSchedules) {
      if (!entry.day) continue;
      const key = `${entry.schedule_type}-${entry.day}`;
      if (seen.has(key)) {
        toast.error('يوجد تكرار في الجدولة: نفس النوع واليوم');
        return;
      }
      seen.add(key);
    }

    setIsSaving(true);
    try {
      let finalNameFr = nameFr.trim();
      if (!finalNameFr && name.trim()) {
        const r = await autoTranslateBeforeSave(name, '', '', 'transliterate');
        finalNameFr = r.fr || '';
      }

      // Get primary schedule info for backward compatibility
      const salesSchedule = formSchedules.find(s => s.schedule_type === 'sales' && s.day);
      const deliverySchedule = formSchedules.find(s => s.schedule_type === 'delivery' && s.day);

      const sectorData = {
        name: name.trim(),
        name_fr: finalNameFr || null,
        branch_id: activeBranch?.id || null,
        sector_type: sectorType,
        // Keep backward compat fields updated with first schedule
        visit_day_sales: sectorType === 'cash_van' ? null : (salesSchedule?.day || null),
        visit_day_delivery: deliverySchedule?.day || null,
        sales_worker_id: sectorType === 'cash_van' ? null : (salesSchedule?.worker_id || null),
        delivery_worker_id: deliverySchedule?.worker_id || null,
        created_by: workerId,
      };

      let savedSectorId: string;

      if (editingSector) {
        await updateSector(editingSector.id, sectorData);
        savedSectorId = editingSector.id;

        const existingZones = zonesMap[editingSector.id] || [];
        const existingNames = existingZones.map(z => z.name);
        const toDelete = existingZones.filter(z => !formZones.some(fz => fz.name === z.name));
        for (const z of toDelete) {
          await supabase.from('sector_zones').delete().eq('id', z.id);
        }
        for (const fz of formZones) {
          const existing = existingZones.find(ez => ez.name === fz.name);
          if (existing && existing.name_fr !== fz.name_fr) {
            await supabase.from('sector_zones').update({ name_fr: fz.name_fr || null }).eq('id', existing.id);
          }
        }
        const toAdd = formZones.filter(fz => !existingNames.includes(fz.name));
        if (toAdd.length > 0) {
          await supabase.from('sector_zones').insert(toAdd.map(fz => ({ sector_id: savedSectorId, name: fz.name, name_fr: fz.name_fr || null })));
        }

        toast.success('تم تحديث السكتور بنجاح');
      } else {
        const newSector = await createSector(sectorData);
        savedSectorId = newSector.id;

        if (formZones.length > 0) {
          await supabase.from('sector_zones').insert(formZones.map(fz => ({ sector_id: savedSectorId, name: fz.name, name_fr: fz.name_fr || null })));
        }

        toast.success('تم إنشاء السكتور بنجاح');
      }

      // Save schedules to sector_schedules table
      const validSchedules = formSchedules
        .filter(s => s.day && s.day !== 'none')
        .map(s => ({
          schedule_type: s.schedule_type,
          day: s.day,
          worker_id: s.worker_id || null,
        }));
      await saveSectorSchedules(savedSectorId, validSchedules);

      await fetchAllZones();
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddZoneToExisting = async (sectorId: string) => {
    const trimmed = newZoneName.trim();
    if (!trimmed) return;
    setAddingZone(true);
    try {
      let frName = newZoneNameFr.trim();
      if (!frName) {
        const r = await autoTranslateBeforeSave(trimmed, '', '', 'transliterate');
        frName = r.fr || '';
      }
      const { error } = await supabase.from('sector_zones').insert({ sector_id: sectorId, name: trimmed, name_fr: frName || null });
      if (error) throw error;
      toast.success('تمت إضافة المنطقة');
      setNewZoneName('');
      setNewZoneNameFr('');
      await fetchAllZones();
    } catch (error: any) {
      toast.error(error.message || 'فشل الإضافة');
    } finally {
      setAddingZone(false);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    try {
      const { error } = await supabase.from('sector_zones').delete().eq('id', zoneId);
      if (error) throw error;
      toast.success('تم حذف المنطقة');
      await fetchAllZones();
    } catch (error: any) {
      toast.error(error.message || 'فشل الحذف');
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

  const renderSectorContent = (sector: Sector, sectorZones: SectorZone[]) => {
    const sectorSchedules = schedulesMap[sector.id] || [];
    const salesSchedules = sectorSchedules.filter(s => s.schedule_type === 'sales');
    const deliverySchedules = sectorSchedules.filter(s => s.schedule_type === 'delivery');

    return (
      <>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1">
            <p className="font-bold text-sm">{sector.name}</p>
            {(sector as any).name_fr && (
              <p className="text-xs text-muted-foreground" dir="ltr">{(sector as any).name_fr}</p>
            )}
            <Badge variant="default" className={`text-[10px] w-fit ${(sector as any).sector_type === 'cash_van' ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`}>
              {(sector as any).sector_type === 'cash_van' ? 'Cash Van' : 'Prévente'}
            </Badge>

            {/* Schedule badges */}
            <div className="flex flex-wrap gap-1.5">
              {salesSchedules.map(sc => (
                <Badge key={`sales-${sc.day}`} variant="outline" className="text-[10px] px-1.5">
                  <Calendar className="w-2.5 h-2.5 ml-0.5" />
                  طلبات: {getDayLabel(sc.day)}
                  {sc.worker_id && getWorkerName(sc.worker_id) && (
                    <span className="text-muted-foreground mr-1">({getWorkerName(sc.worker_id)})</span>
                  )}
                </Badge>
              ))}
              {deliverySchedules.map(sc => (
                <Badge key={`delivery-${sc.day}`} variant="outline" className="text-[10px] px-1.5">
                  <Truck className="w-2.5 h-2.5 ml-0.5" />
                  توصيل: {getDayLabel(sc.day)}
                  {sc.worker_id && getWorkerName(sc.worker_id) && (
                    <span className="text-muted-foreground mr-1">({getWorkerName(sc.worker_id)})</span>
                  )}
                </Badge>
              ))}
              {sectorZones.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  <Layers className="w-2.5 h-2.5 ml-0.5" />
                  {sectorZones.length} منطقة
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedZonesSector(expandedZonesSector === sector.id ? null : sector.id)} title="المناطق">
              <Layers className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(sector)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setSectorToDelete(sector)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {expandedZonesSector === sector.id && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Layers className="w-3 h-3" />
              المناطق
            </Label>
            {sectorZones.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {sectorZones.map(zone => (
                  <Badge key={zone.id} variant="outline" className="text-xs flex items-center gap-1 pr-1">
                    {zone.name}{zone.name_fr ? ` (${zone.name_fr})` : ''}
                    <button onClick={() => handleDeleteZone(zone.id)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد مناطق</p>
            )}
            <div className="flex gap-2">
              <Input value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="اسم المنطقة..." className="text-right text-sm flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddZoneToExisting(sector.id); } }} />
              <Input value={newZoneNameFr} onChange={e => setNewZoneNameFr(e.target.value)} placeholder="Nom..." dir="ltr" className="text-sm flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddZoneToExisting(sector.id); } }} />
              <Button variant="outline" size="sm" onClick={() => handleAddZoneToExisting(sector.id)} disabled={!newZoneName.trim() || addingZone}>
                {addingZone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderScheduleForm = () => {
    const availableTypes = sectorType === 'cash_van' ? ['delivery'] : ['sales', 'delivery'];
    const typeLabels: Record<string, string> = { sales: 'طلبات', delivery: 'توصيل' };

    return (
      <div className="space-y-2 border rounded-lg p-3 bg-background">
        <div className="flex items-center justify-between">
          <Label className="text-sm flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            الجدولة (أيام الزيارة والعمال)
          </Label>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddScheduleEntry}>
            <Plus className="w-3 h-3 ml-1" />
            إضافة
          </Button>
        </div>

        {formSchedules.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">لا توجد جدولة. اضغط "إضافة" لتحديد الأيام والعمال.</p>
        )}

        {formSchedules.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 border rounded-md p-2 bg-muted/30">
            <Select value={entry.schedule_type} onValueChange={(v) => handleUpdateScheduleEntry(index, 'schedule_type', v)}>
              <SelectTrigger className="text-[11px] h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map(t => (
                  <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={entry.day} onValueChange={(v) => handleUpdateScheduleEntry(index, 'day', v)}>
              <SelectTrigger className="text-[11px] h-8 flex-1">
                <SelectValue placeholder="اليوم" />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={entry.worker_id} onValueChange={(v) => handleUpdateScheduleEntry(index, 'worker_id', v)}>
              <SelectTrigger className="text-[11px] h-8 flex-1">
                <SelectValue placeholder="العامل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                {workers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleRemoveScheduleEntry(index)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    );
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
                <div className="flex gap-2">
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="الاسم بالعربية" className="text-right flex-1" autoFocus />
                  <Input value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder="Nom en français" dir="ltr" className="flex-1" />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleTranslateSectorName} disabled={translatingName}>
                    {translatingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Sector Type Switch */}
              <div className="flex items-center justify-between border rounded-lg p-3 bg-background">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">
                    {sectorType === 'prevente' ? 'Prévente' : 'Cash Van'}
                  </Label>
                  <Badge variant={sectorType === 'prevente' ? 'default' : 'secondary'} className="text-[10px]">
                    {sectorType === 'prevente' ? 'طلبات + توصيل' : 'بيع مباشر'}
                  </Badge>
                </div>
                <Switch
                  checked={sectorType === 'cash_van'}
                  onCheckedChange={(checked) => {
                    setSectorType(checked ? 'cash_van' : 'prevente');
                    // Remove sales schedules when switching to cash_van
                    if (checked) {
                      setFormSchedules(prev => prev.filter(s => s.schedule_type !== 'sales'));
                    }
                  }}
                />
              </div>

              {/* Zones inside the form */}
              <div className="space-y-2 border rounded-lg p-3 bg-background">
                <Label className="text-sm flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  المناطق داخل السكتور
                </Label>
                {formZones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formZones.map((zone) => (
                      <Badge key={zone.name} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                        {zone.name}{zone.name_fr ? ` (${zone.name_fr})` : ''}
                        <button type="button" onClick={() => handleRemoveFormZone(zone.name)} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input value={newFormZone} onChange={e => setNewFormZone(e.target.value)} placeholder="اسم المنطقة..." className="text-right text-sm flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFormZone(); } }} />
                  <Input value={newFormZoneFr} onChange={e => setNewFormZoneFr(e.target.value)} placeholder="Nom..." dir="ltr" className="text-sm flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFormZone(); } }} />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleTranslateZoneName} disabled={translatingZone}>
                    {translatingZone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddFormZone} disabled={!newFormZone.trim()}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Schedule entries (replaces old day/worker selects) */}
              {renderScheduleForm()}

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

          {/* Filters */}
          {!showForm && sectors.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Filter className="w-3.5 h-3.5" />
                فلترة
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                  <SelectTrigger className="text-[11px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="prevente">Prévente</SelectItem>
                    <SelectItem value="cash_van">Cash Van</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterDay} onValueChange={setFilterDay}>
                  <SelectTrigger className="text-[11px] h-8"><SelectValue placeholder="اليوم" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأيام</SelectItem>
                    {DAYS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterWorker} onValueChange={setFilterWorker}>
                  <SelectTrigger className="text-[11px] h-8"><SelectValue placeholder="العامل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل العمال</SelectItem>
                    {workers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(filterType !== 'all' || filterDay !== 'all' || filterWorker !== 'all') && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{filteredSectors.length} / {sectors.length}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { setFilterType('all'); setFilterDay('all'); setFilterWorker('all'); }}>
                    <X className="w-3 h-3 ml-1" /> مسح الفلاتر
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Sectors List */}
          <div className="space-y-2 mt-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredSectors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{sectors.length === 0 ? 'لا توجد سكتورات بعد' : 'لا توجد نتائج'}</p>
              </div>
            ) : groupedByDay ? (
              groupedByDay.map(group => (
                <div key={group.day.value} className="space-y-2">
                  <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-3 py-1.5 rounded-md border flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold text-primary">{group.day.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{group.sectors.length}</Badge>
                  </div>
                  {group.sectors.map(sector => {
                    const sectorZones = zonesMap[sector.id] || [];
                    return (
                      <Card key={sector.id}>
                        <CardContent className="p-3">
                          {renderSectorContent(sector, sectorZones)}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ))
            ) : (
              sortedFilteredSectors.map(sector => {
                const sectorZones = zonesMap[sector.id] || [];
                return (
                  <Card key={sector.id}>
                    <CardContent className="p-3">
                      {renderSectorContent(sector, sectorZones)}
                    </CardContent>
                  </Card>
                );
              })
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
