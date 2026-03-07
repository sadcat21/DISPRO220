import React, { useState, useEffect } from 'react';
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
  const [nameFr, setNameFr] = useState('');
  const [sectorType, setSectorType] = useState<SectorType>('prevente');
  const [visitDaySales, setVisitDaySales] = useState('');
  const [visitDayDelivery, setVisitDayDelivery] = useState('');
  const [salesWorkerId, setSalesWorkerId] = useState('');
  const [deliveryWorkerId, setDeliveryWorkerId] = useState('');

  // Zone management state
  const [zonesMap, setZonesMap] = useState<Record<string, SectorZone[]>>({});
  const [expandedZonesSector, setExpandedZonesSector] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneNameFr, setNewZoneNameFr] = useState('');
  const [addingZone, setAddingZone] = useState(false);
  // Zones for the form (when creating/editing a sector)
  const [formZones, setFormZones] = useState<{ name: string; name_fr: string }[]>([]);
  const [newFormZone, setNewFormZone] = useState('');
  const [newFormZoneFr, setNewFormZoneFr] = useState('');
  const [translatingName, setTranslatingName] = useState(false);
  const [translatingZone, setTranslatingZone] = useState(false);

  // Filter state
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [filterType, setFilterType] = useState<'all' | 'prevente' | 'cash_van'>('all');

  const filteredSectors = sectors.filter(s => {
    if (filterType !== 'all' && (s as any).sector_type !== filterType) return false;
    if (filterDay !== 'all' && s.visit_day_sales !== filterDay && s.visit_day_delivery !== filterDay) return false;
    if (filterWorker !== 'all' && s.sales_worker_id !== filterWorker && s.delivery_worker_id !== filterWorker) return false;
    return true;
  });
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
    setVisitDaySales('');
    setVisitDayDelivery('');
    setSalesWorkerId('');
    setDeliveryWorkerId('');
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
    setVisitDaySales(sector.visit_day_sales || '');
    setVisitDayDelivery(sector.visit_day_delivery || '');
    setSalesWorkerId(sector.sales_worker_id || '');
    setDeliveryWorkerId(sector.delivery_worker_id || '');
    setFormZones((zonesMap[sector.id] || []).map(z => ({ name: z.name, name_fr: z.name_fr || '' })));
    setShowForm(true);
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
    setIsSaving(true);
    try {
      // Auto-translate sector name if French is empty
      let finalNameFr = nameFr.trim();
      if (!finalNameFr && name.trim()) {
        const r = await autoTranslateBeforeSave(name, '', '', 'transliterate');
        finalNameFr = r.fr || '';
      }

      const sectorData = {
        name: name.trim(),
        name_fr: finalNameFr || null,
        branch_id: activeBranch?.id || null,
        sector_type: sectorType,
        visit_day_sales: sectorType === 'cash_van' ? null : (visitDaySales || null),
        visit_day_delivery: visitDayDelivery || null,
        sales_worker_id: sectorType === 'cash_van' ? null : (salesWorkerId || null),
        delivery_worker_id: deliveryWorkerId || null,
        created_by: workerId,
      };

      let savedSectorId: string;

      if (editingSector) {
        await updateSector(editingSector.id, sectorData);
        savedSectorId = editingSector.id;

        const existingZones = zonesMap[editingSector.id] || [];
        const existingNames = existingZones.map(z => z.name);

        // Delete zones that were removed
        const toDelete = existingZones.filter(z => !formZones.some(fz => fz.name === z.name));
        for (const z of toDelete) {
          await supabase.from('sector_zones').delete().eq('id', z.id);
        }

        // Update existing zones (name_fr)
        for (const fz of formZones) {
          const existing = existingZones.find(ez => ez.name === fz.name);
          if (existing && existing.name_fr !== fz.name_fr) {
            await supabase.from('sector_zones').update({ name_fr: fz.name_fr || null }).eq('id', existing.id);
          }
        }

        // Add new zones
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
      // Auto-translate zone name
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
                  onCheckedChange={(checked) => setSectorType(checked ? 'cash_van' : 'prevente')}
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
                  <Input
                    value={newFormZone}
                    onChange={e => setNewFormZone(e.target.value)}
                    placeholder="اسم المنطقة..."
                    className="text-right text-sm flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFormZone(); } }}
                  />
                  <Input
                    value={newFormZoneFr}
                    onChange={e => setNewFormZoneFr(e.target.value)}
                    placeholder="Nom..."
                    dir="ltr"
                    className="text-sm flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFormZone(); } }}
                  />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleTranslateZoneName} disabled={translatingZone}>
                    {translatingZone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddFormZone} disabled={!newFormZone.trim()}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {sectorType === 'prevente' ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> يوم البيع المباشر</Label>
                    <Select value={visitDayDelivery} onValueChange={setVisitDayDelivery}>
                      <SelectTrigger className="text-xs h-9"><SelectValue placeholder="اختر اليوم" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون</SelectItem>
                        {DAYS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Truck className="w-3 h-3" /> عامل التوصيل / البيع المباشر</Label>
                    <Select value={deliveryWorkerId} onValueChange={setDeliveryWorkerId}>
                      <SelectTrigger className="text-xs h-9"><SelectValue placeholder="اختر العامل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون</SelectItem>
                        {workers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

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
            ) : (
              filteredSectors.map(sector => {
                const sectorZones = zonesMap[sector.id] || [];
                return (
                  <Card key={sector.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1.5 flex-1">
                          <p className="font-bold text-sm">{sector.name}</p>
                          {(sector as any).name_fr && (
                            <p className="text-xs text-muted-foreground" dir="ltr">{(sector as any).name_fr}</p>
                          )}
                          <Badge variant={(sector as any).sector_type === 'cash_van' ? 'secondary' : 'default'} className="text-[10px] w-fit">
                            {(sector as any).sector_type === 'cash_van' ? 'Cash Van' : 'Prévente'}
                          </Badge>
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
                            {sectorZones.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                <Layers className="w-2.5 h-2.5 ml-0.5" />
                                {sectorZones.length} منطقة
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

                      {/* Zones expandable section */}
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
                            <Input
                              value={newZoneName}
                              onChange={e => setNewZoneName(e.target.value)}
                              placeholder="اسم المنطقة..."
                              className="text-right text-sm flex-1"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddZoneToExisting(sector.id); } }}
                            />
                            <Input
                              value={newZoneNameFr}
                              onChange={e => setNewZoneNameFr(e.target.value)}
                              placeholder="Nom..."
                              dir="ltr"
                              className="text-sm flex-1"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddZoneToExisting(sector.id); } }}
                            />
                            <Button variant="outline" size="sm" onClick={() => handleAddZoneToExisting(sector.id)} disabled={!newZoneName.trim() || addingZone}>
                              {addingZone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>
                      )}
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
