import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Store, Building2, Warehouse, ChevronDown, ChevronUp, CreditCard, User, Languages, MapPin, UserCircle, Shield, Plus, Trash2, Type, BookOpen, X, Truck } from 'lucide-react';
import DeliveryWorkerSelect from './DeliveryWorkerSelect';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Customer } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ALGERIAN_WILAYAS } from '@/data/algerianWilayas';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';
import { useSectors } from '@/hooks/useSectors';
import { useCustomerDebtSummary, useCreateDebt, useUpdateDebtPayment } from '@/hooks/useCustomerDebts';
import { useAuth } from '@/contexts/AuthContext';
import { reverseGeocode } from '@/utils/geoUtils';
import { useCustomerTypes, getCustomerTypeColor } from '@/hooks/useCustomerTypes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedName } from '@/utils/sectorName';

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSuccess: (customer: Customer) => void;
}

interface SectorZone {
  id: string;
  name: string;
  sector_id: string;
}

interface SalesRep {
  name: string;
  phone: string;
}

const isArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

const EditCustomerDialog: React.FC<EditCustomerDialogProps> = ({
  open,
  onOpenChange,
  customer,
  onSuccess,
}) => {
  const { sectors } = useSectors();
  const { data: debtSummary } = useCustomerDebtSummary(customer?.id || null);
  const createDebt = useCreateDebt();
  const updateDebtPayment = useUpdateDebtPayment();
  const { workerId, role } = useAuth();
  const { customerTypes } = useCustomerTypes();
  const { language } = useLanguage();
  const [name, setName] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [translatingName, setTranslatingName] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeNameFr, setStoreNameFr] = useState('');
  const [translatingStore, setTranslatingStore] = useState(false);
  const [translationMode, setTranslationMode] = useState<'transliterate' | 'translate'>('transliterate');
  const [sectorId, setSectorId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [zones, setZones] = useState<SectorZone[]>([]);
  const [phones, setPhones] = useState<string[]>(['']);
  const [address, setAddress] = useState('');
  const [addressLoading, setAddressLoading] = useState(false);
  const [wilaya, setWilaya] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [locationType, setLocationType] = useState<'store' | 'warehouse' | 'office'>('store');
  const [salesReps, setSalesReps] = useState<SalesRep[]>([{ name: '', phone: '' }]);
  const [internalName, setInternalName] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustNotes, setTrustNotes] = useState('');
  const [defaultPaymentType, setDefaultPaymentType] = useState<string>('without_invoice');
  const [defaultPriceSubtype, setDefaultPriceSubtype] = useState<string>('gros');
  const [customerType, setCustomerType] = useState<string>('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [defaultDeliveryWorkerId, setDefaultDeliveryWorkerId] = useState('');

  // Fetch zones when sector changes
  const pendingZoneId = React.useRef<string>('');
  const [zonesLoading, setZonesLoading] = useState(false);
  const [addingZone, setAddingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [savingZone, setSavingZone] = useState(false);

  const fetchZones = useCallback((sid: string) => {
    setZonesLoading(true);
    supabase.from('sector_zones').select('id, name, sector_id').eq('sector_id', sid).order('name')
      .then(({ data }) => {
        setZones(data || []);
        if (pendingZoneId.current && data?.find(z => z.id === pendingZoneId.current)) {
          setZoneId(pendingZoneId.current);
          pendingZoneId.current = '';
        } else if (!data?.find(z => z.id === zoneId)) {
          if (!pendingZoneId.current) setZoneId('');
        }
        setZonesLoading(false);
      });
  }, [zoneId]);

  useEffect(() => {
    setAddingZone(false);
    if (!sectorId) { setZones([]); return; }
    fetchZones(sectorId);
    // Auto-suggest delivery worker from sector (only if not already set by customer data)
    if (!customer) {
      const sector = sectors.find(s => s.id === sectorId);
      if (sector?.delivery_worker_id) {
        setDefaultDeliveryWorkerId(sector.delivery_worker_id);
      }
    }
  }, [sectorId, fetchZones, sectors]);

  const handleAddZone = async () => {
    if (!newZoneName.trim() || !sectorId) return;
    setSavingZone(true);
    try {
      const { data, error } = await supabase.from('sector_zones').insert({ name: newZoneName.trim(), sector_id: sectorId }).select().single();
      if (error) throw error;
      toast.success(`تمت إضافة المنطقة: ${newZoneName.trim()}`);
      setNewZoneName('');
      setAddingZone(false);
      fetchZones(sectorId);
      if (data) setZoneId(data.id);
    } catch (err: any) {
      toast.error('فشل في إضافة المنطقة: ' + err.message);
    } finally {
      setSavingZone(false);
    }
  };

  // Completion percentage
  const completionPercent = useMemo(() => {
    const requiredFields = [
      !!name.trim(),
      !!phones[0]?.trim(),
      !!storeName.trim(),
      !!(sectorId && sectorId !== 'none'),
      !!(latitude && longitude),
    ];
    const optionalFields = [
      !!address.trim(),
      !!wilaya,
      !!nameFr.trim(),
      !!internalName.trim(),
      !!salesReps[0]?.name.trim(),
      !!zoneId,
    ];
    const total = requiredFields.length + optionalFields.length;
    const filled = [...requiredFields, ...optionalFields].filter(Boolean).length;
    return Math.round((filled / total) * 100);
  }, [name, phones, storeName, sectorId, latitude, longitude, address, wilaya, nameFr, internalName, salesReps, zoneId]);

  useEffect(() => {
    if (debtSummary) {
      setDebtAmount(debtSummary.totalDebt.toString());
    }
  }, [debtSummary]);

  useEffect(() => {
    if (open && customer) {
      setName(customer.name || '');
      setNameFr(customer.name_fr || '');
      setStoreName(customer.store_name || '');
      setStoreNameFr((customer as any).store_name_fr || '');
      setInternalName(customer.internal_name || '');
      setSectorId(customer.sector_id || '');
      pendingZoneId.current = customer.zone_id || '';
      setZoneId(customer.zone_id || '');
      // Parse multiple phones
      const phoneList = customer.phone ? customer.phone.split(/\s*\/\s*/).filter(Boolean) : [''];
      setPhones(phoneList.length > 0 ? phoneList : ['']);
      // Parse multiple sales reps
      const repNames = customer.sales_rep_name ? customer.sales_rep_name.split(/\s*\/\s*/).filter(Boolean) : [];
      const repPhones = customer.sales_rep_phone ? customer.sales_rep_phone.split(/\s*\/\s*/).filter(Boolean) : [];
      const reps: SalesRep[] = [];
      const maxLen = Math.max(repNames.length, repPhones.length, 1);
      for (let i = 0; i < maxLen; i++) {
        reps.push({ name: repNames[i] || '', phone: repPhones[i] || '' });
      }
      setSalesReps(reps);
      setAddress(customer.address || '');
      setWilaya(customer.wilaya || '');
      setLatitude(customer.latitude);
      setLongitude(customer.longitude);
      setLocationType((customer as any).location_type || 'store');
      setIsTrusted(customer.is_trusted || false);
      setTrustNotes(customer.trust_notes || '');
      setDefaultPaymentType(customer.default_payment_type || 'without_invoice');
      setDefaultPriceSubtype(customer.default_price_subtype || 'gros');
      setCustomerType(customer.customer_type || '');
      setIsRegistered((customer as any).is_registered || false);
      setDefaultDeliveryWorkerId((customer as any).default_delivery_worker_id || '');
      setShowMap(!!(customer.latitude && customer.longitude));

      if (customer.latitude && customer.longitude && !customer.address) {
        fetchAddressFromCoords(customer.latitude, customer.longitude);
      }
    }
  }, [open, customer]);

  const fetchAddressFromCoords = useCallback(async (lat: number, lng: number) => {
    setAddressLoading(true);
    try {
      const addr = await reverseGeocode(lat, lng);
      if (addr && addr !== 'عنوان غير معروف') {
        setAddress(addr);
      }
    } catch {
      // Silent fail
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const translateText = async (text: string, sourceLang: string, targetLang: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text: text.trim(), sourceLang, targetLangs: [targetLang], mode: translationMode },
      });
      if (!error && data?.translations?.[targetLang]) {
        return data.translations[targetLang];
      }
    } catch { /* Silent */ }
    return null;
  };

  const handleNameBlur = async () => {
    if (!name.trim()) return;
    setTranslatingName(true);
    if (isArabic(name.trim())) {
      const result = await translateText(name.trim(), 'ar', 'fr');
      if (result) setNameFr(result);
    } else {
      const arResult = await translateText(name.trim(), 'fr', 'ar');
      if (arResult) {
        setNameFr(name.trim());
        setName(arResult);
      }
    }
    setTranslatingName(false);
  };

  const handleStoreNameBlur = async () => {
    if (!storeName.trim()) return;
    setTranslatingStore(true);
    if (isArabic(storeName.trim())) {
      const result = await translateText(storeName.trim(), 'ar', 'fr');
      if (result) setStoreNameFr(result);
    } else {
      const arResult = await translateText(storeName.trim(), 'fr', 'ar');
      if (arResult) {
        setStoreNameFr(storeName.trim());
        setStoreName(arResult);
      }
    }
    setTranslatingStore(false);
  };

  const handleLocationChange = useCallback((lat: number, lng: number, addressText?: string) => {
    console.log('📍 handleLocationChange called:', { lat, lng, addressText });
    setLatitude(lat);
    setLongitude(lng);
    // Always fetch a proper Arabic address using reverseGeocode
    fetchAddressFromCoords(lat, lng);
  }, [fetchAddressFromCoords]);

  // Phone helpers
  const addPhone = () => setPhones(prev => [...prev, '']);
  const removePhone = (idx: number) => setPhones(prev => prev.filter((_, i) => i !== idx));
  const updatePhone = (idx: number, val: string) => setPhones(prev => prev.map((p, i) => i === idx ? val : p));

  // Sales rep helpers
  const addSalesRep = () => setSalesReps(prev => [...prev, { name: '', phone: '' }]);
  const removeSalesRep = (idx: number) => setSalesReps(prev => prev.filter((_, i) => i !== idx));
  const updateSalesRep = (idx: number, field: keyof SalesRep, val: string) =>
    setSalesReps(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    const isManager = role === 'admin' || role === 'branch_admin';
    if (!name.trim()) { toast.error('الرجاء إدخال اسم العميل'); return; }
    if (!isManager) {
      if (!phones[0]?.trim()) { toast.error('الرجاء إدخال رقم هاتف العميل'); return; }
      if (!storeName.trim()) { toast.error('الرجاء إدخال اسم المحل'); return; }
      if (!sectorId || sectorId === 'none') { toast.error('الرجاء اختيار السكتور'); return; }
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) { toast.error('يرجى تحديد الموقع الجغرافي على الخريطة'); return; }
      if (customerTypes.length > 0 && !customerType) { toast.error('يجب تحديد نوع العميل'); return; }
    }

    setIsLoading(true);
    try {
      const phoneStr = phones.filter(p => p.trim()).join(' / ');
      const repsNames = salesReps.filter(r => r.name.trim()).map(r => r.name.trim()).join(' / ');
      const repsPhones = salesReps.filter(r => r.phone.trim()).map(r => r.phone.trim()).join(' / ');

      const payload = {
        name: name.trim(),
        name_fr: nameFr.trim() || null,
        store_name: storeName.trim() || null,
        store_name_fr: storeNameFr.trim() || null,
        internal_name: internalName.trim() || null,
        phone: phoneStr || null,
        address: address.trim() || null,
        wilaya: wilaya || null,
        latitude, longitude,
        location_type: locationType,
        sector_id: sectorId,
        zone_id: zoneId || null,
        sales_rep_name: repsNames || null,
        sales_rep_phone: repsPhones || null,
        is_trusted: isTrusted,
        trust_notes: trustNotes.trim() || null,
        default_payment_type: defaultPaymentType,
        default_price_subtype: defaultPriceSubtype,
        customer_type: customerType || null,
        is_registered: isRegistered,
        default_delivery_worker_id: defaultDeliveryWorkerId || null,
      };
      // Workers must go through approval for updates, admins can update directly
      const isManager = role === 'admin' || role === 'branch_admin';

      if (isManager) {
        const { data, error } = await supabase.from('customers').update(payload).eq('id', customer.id).select().single();
        if (error) throw error;

        // Handle debt changes
        const currentDebt = debtSummary?.totalDebt || 0;
        const newDebt = parseFloat(debtAmount) || 0;
        const difference = newDebt - currentDebt;

        if (difference > 0 && workerId) {
          await createDebt.mutateAsync({ customer_id: customer.id, worker_id: workerId, total_amount: difference, paid_amount: 0, notes: 'تعديل دين من بيانات العميل' });
        } else if (difference < 0 && workerId) {
          const absDiff = Math.abs(difference);
          const { data: activeDebts } = await supabase.from('customer_debts').select('id, total_amount, paid_amount, remaining_amount').eq('customer_id', customer.id).eq('status', 'active').order('created_at', { ascending: true });
          if (activeDebts && activeDebts.length > 0) {
            let remainingPayment = absDiff;
            for (const debt of activeDebts) {
              if (remainingPayment <= 0) break;
              const debtRemaining = Number(debt.remaining_amount) || (Number(debt.total_amount) - Number(debt.paid_amount));
              const payAmount = Math.min(remainingPayment, debtRemaining);
              if (payAmount > 0) {
                await updateDebtPayment.mutateAsync({ debtId: debt.id, amount: payAmount, workerId, paymentMethod: 'cash', notes: 'تخفيض دين من بيانات العميل' });
                remainingPayment -= payAmount;
              }
            }
          }
        }

        toast.success('تم تحديث بيانات العميل بنجاح');
        onSuccess(data);
        onOpenChange(false);
      } else {
        const locationPayload = {
          latitude,
          longitude,
          address: address.trim() || null,
          wilaya: wilaya || null,
          location_type: locationType,
        };

        const locationChanged =
          String(customer.latitude ?? '') !== String(latitude ?? '') ||
          String(customer.longitude ?? '') !== String(longitude ?? '') ||
          String(customer.address ?? '') !== String(locationPayload.address ?? '') ||
          String(customer.wilaya ?? '') !== String(locationPayload.wilaya ?? '') ||
          String((customer as any).location_type ?? 'store') !== String(locationType ?? 'store');

        const nonLocationKeys = [
          'name', 'name_fr', 'store_name', 'store_name_fr', 'internal_name', 'phone',
          'sector_id', 'zone_id', 'sales_rep_name', 'sales_rep_phone', 'is_trusted',
          'trust_notes', 'default_payment_type', 'default_price_subtype', 'customer_type',
          'is_registered', 'default_delivery_worker_id'
        ];

        const hasNonLocationChanges = nonLocationKeys.some((key) =>
          String((customer as any)[key] ?? '') !== String((payload as any)[key] ?? '')
        );

        if (!locationChanged && !hasNonLocationChanges) {
          toast.info('لا توجد تغييرات للحفظ');
          onOpenChange(false);
          return;
        }

        let locationUpdatedCustomer: Customer | null = null;

        // Allow immediate GPS persistence even for worker edits (if policy allows)
        if (locationChanged) {
          const { data: updatedLocationData, error: locationError } = await supabase
            .from('customers')
            .update(locationPayload)
            .eq('id', customer.id)
            .select()
            .single();

          if (!locationError && updatedLocationData) {
            locationUpdatedCustomer = updatedLocationData as Customer;
          } else {
            console.warn('Direct location update failed, fallback to approval request:', locationError);
          }
        }

        // Keep approval workflow for any non-location changes or if direct location update is not allowed
        if (hasNonLocationChanges || (locationChanged && !locationUpdatedCustomer)) {
          const { error } = await supabase
            .from('customer_approval_requests')
            .insert({
              operation_type: 'update',
              customer_id: customer.id,
              payload: { ...payload, new_debt_amount: parseFloat(debtAmount) || 0 },
              requested_by: workerId,
              branch_id: customer.branch_id || null,
              status: 'pending'
            } as any);

          if (error) throw error;

          if (locationUpdatedCustomer) {
            toast.success('تم حفظ موقع GPS مباشرة وإرسال باقي التعديلات للمراجعة');
          } else {
            toast.success('تم إرسال طلب تعديل العميل للمراجعة');
          }
        } else {
          toast.success('تم حفظ موقع GPS بنجاح');
        }

        if (locationUpdatedCustomer) {
          onSuccess(locationUpdatedCustomer);
        }

        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('فشل في تحديث بيانات العميل');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات العميل</DialogTitle>
        </DialogHeader>

        {/* Completion Bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">اكتمال البيانات</span>
            <span className="text-xs font-semibold text-primary">{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} className="h-2" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* --- Section 1: Basic Info --- */}
          <div className="space-y-4 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            <Label className="font-bold flex items-center gap-2 text-sm text-primary">
              <User className="w-4 h-4" />
              المعلومات الأساسية
            </Label>
            {/* Translation mode toggle */}
            <div className="flex rounded-md border border-input overflow-hidden">
              <button
                type="button"
                className={`flex items-center gap-1 px-2 py-1.5 text-xs flex-1 transition-colors ${
                  translationMode === 'transliterate'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setTranslationMode('transliterate')}
              >
                <Type className="w-3 h-3" />
                ترجمة حرفية (نطق)
              </button>
              <button
                type="button"
                className={`flex items-center gap-1 px-2 py-1.5 text-xs flex-1 transition-colors ${
                  translationMode === 'translate'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setTranslationMode('translate')}
              >
                <BookOpen className="w-3 h-3" />
                ترجمة المعنى
              </button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">اسم العميل *</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={handleNameBlur} placeholder="أدخل اسم العميل" className="text-right" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name-fr" className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" />
                اسم العميل بالفرنسية
                {translatingName && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="edit-name-fr" value={nameFr} onChange={(e) => setNameFr(e.target.value)} placeholder="Nom du client (Français)" className="text-left" dir="ltr" />
            </div>

            {/* Phone numbers - multiple */}
            <div className="space-y-2">
              <Label>هاتف العميل *</Label>
              {phones.map((ph, idx) => (
                <div key={idx} className="flex gap-1.5">
                  <Input type="tel" value={ph} onChange={(e) => updatePhone(idx, e.target.value)} placeholder={`هاتف ${idx + 1}`} className="text-right flex-1" dir="ltr" required={idx === 0} />
                  {idx > 0 && (
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive shrink-0" onClick={() => removePhone(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={addPhone}>
                <Plus className="w-3 h-3 ml-1" /> إضافة رقم هاتف آخر
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-store-name">اسم المحل *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => {
                    if (name.trim()) {
                      setStoreName(name.trim());
                      if (nameFr.trim()) setStoreNameFr(nameFr.trim());
                      toast.success('تم نسخ اسم العميل إلى المحل');
                    }
                  }}
                >
                  <User className="w-3 h-3" />
                  نسخ اسم العميل
                </Button>
              </div>
              <Input id="edit-store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} onBlur={handleStoreNameBlur} placeholder="اسم المحل (عربي أو فرنسي)" className="text-right" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-store-name-fr" className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" />
                اسم المحل بالفرنسية
                {translatingStore && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="edit-store-name-fr" value={storeNameFr} onChange={(e) => setStoreNameFr(e.target.value)} placeholder="Nom du magasin (Français)" className="text-left" dir="ltr" />
            </div>

            {/* Customer Type - integrated after store name */}
            {customerTypes.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Store className="w-4 h-4" />
                  نوع العميل *
                </Label>
                <div className="flex flex-wrap gap-2">
                  {customerTypes.map((entry, idx) => {
                    const colors = getCustomerTypeColor(entry.short, idx, entry);
                    const isActive = customerType === entry.ar;
                    return (
                      <Button
                        key={entry.ar}
                        type="button"
                        variant="default"
                        size="sm"
                        className={`font-mono uppercase text-xs hover:opacity-100 ${isActive ? 'ring-2 ring-offset-1 ring-foreground/40' : ''}`}
                        style={{ backgroundColor: colors.bg, borderColor: colors.bg, color: colors.text }}
                        onClick={() => setCustomerType(isActive ? '' : entry.ar)}
                      >
                        {entry.short || entry[language] || entry.ar}
                      </Button>
                    );
                  })}
                </div>
                {customerType && (() => {
                  const selected = customerTypes.find(t => t.ar === customerType);
                  return selected ? (
                    <p className="text-xs text-muted-foreground">{selected.fr} — {selected[language] || selected.ar}</p>
                  ) : null;
                })()}
                {!customerType && <p className="text-xs text-destructive">يجب تحديد نوع العميل</p>}
              </div>
            )}


            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-primary" />
                الاسم الداخلي (للفريق فقط)
              </Label>
              <Input value={internalName} onChange={(e) => setInternalName(e.target.value)} placeholder="اسم مختصر أو لقب داخلي..." className="text-right" />
              <p className="text-xs text-muted-foreground">هذا الاسم يظهر لفريق العمل فقط ولا يراه التاجر</p>
            </div>

            {/* Sales Representatives - multiple */}
            <div className="border rounded-lg p-3 space-y-2 bg-background/60">
              <Label className="flex items-center gap-1 text-sm font-semibold">
                <User className="w-3.5 h-3.5" />
                مسؤول المبيعات / المشتريات (عند الزبون)
              </Label>
              {salesReps.map((rep, idx) => (
                <div key={idx} className="space-y-1.5">
                  {idx > 0 && <div className="border-t pt-1.5" />}
                  <div className="flex gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5 flex-1">
                      <Input value={rep.name} onChange={(e) => updateSalesRep(idx, 'name', e.target.value)} placeholder="الاسم" className="text-right text-sm" />
                      <Input value={rep.phone} onChange={(e) => updateSalesRep(idx, 'phone', e.target.value)} placeholder="رقم الهاتف" className="text-right text-sm" dir="ltr" />
                    </div>
                    {idx > 0 && (
                      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive shrink-0" onClick={() => removeSalesRep(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={addSalesRep}>
                <Plus className="w-3 h-3 ml-1" /> إضافة مسؤول آخر
              </Button>
            </div>
          </div>




          {/* --- Section: Location & Sector --- */}
          <div className="space-y-4 rounded-xl border-2 border-emerald-500/20 bg-emerald-500/5 p-4">
            <Label className="font-bold flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <MapPin className="w-4 h-4" />
              تفاصيل الموقع والسكتور
            </Label>

            {sectors.length > 0 && (
              <div className="space-y-2">
                <Label>السكتور *</Label>
                <Select value={sectorId || ''} onValueChange={setSectorId}>
                  <SelectTrigger className={!sectorId ? 'border-destructive' : ''}>
                    <SelectValue placeholder="اختر السكتور" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="bg-popover z-[10050] max-h-60">
                    {sectors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{getLocalizedName(s, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!sectorId && <p className="text-xs text-destructive">يجب اختيار سكتور</p>}
              </div>
            )}

            {sectorId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  المنطقة داخل السكتور
                  {zonesLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </Label>
                {addingZone ? (
                  <div className="flex gap-2" dir="rtl">
                    <Input value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="اسم المنطقة الجديدة" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAddZone()} />
                    <Button size="sm" onClick={handleAddZone} disabled={savingZone || !newZoneName.trim()}>
                      {savingZone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingZone(false); setNewZoneName(''); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={zoneId || 'none'} onValueChange={(val) => {
                    if (val === '__add_new') { setAddingZone(true); return; }
                    setZoneId(val === 'none' ? '' : val);
                  }} disabled={zonesLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={zonesLoading ? 'جاري التحميل...' : zones.length === 0 ? 'لا توجد مناطق' : 'اختر المنطقة'} />
                    </SelectTrigger>
                    <SelectContent position="popper" className="bg-popover z-[10050] max-h-60">
                      <SelectItem value="none">بدون تحديد</SelectItem>
                      {zones.map(z => (
                        <SelectItem key={z.id} value={z.id}>{getLocalizedName(z, language)}</SelectItem>
                      ))}
                      <SelectItem value="__add_new" className="text-primary font-semibold">
                        إضافة منطقة لـ <span className="text-foreground">{(() => { const found = sectors.find(s => s.id === sectorId); return found ? getLocalizedName(found, language) : 'السكتور'; })()}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Default Delivery Worker - under sector/zone */}
            {sectorId && (
              <DeliveryWorkerSelect
                customerBranchId={customer?.branch_id || null}
                value={defaultDeliveryWorkerId}
                onChange={setDefaultDeliveryWorkerId}
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-wilaya">الولاية</Label>
              <Select value={wilaya} onValueChange={setWilaya}>
                <SelectTrigger><SelectValue placeholder="اختر الولاية" /></SelectTrigger>
                <SelectContent position="popper" className="z-[10050] bg-popover max-h-60">
                  {ALGERIAN_WILAYAS.map((w) => (
                    <SelectItem key={w.code} value={w.name}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>نوع الموقع</Label>
              <div className="flex gap-2">
                <Button type="button" variant={locationType === 'store' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('store')}>
                  <Store className="w-4 h-4 ml-1" /> محل
                </Button>
                <Button type="button" variant={locationType === 'warehouse' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('warehouse')}>
                  <Warehouse className="w-4 h-4 ml-1" /> مخزن
                </Button>
                <Button type="button" variant={locationType === 'office' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('office')}>
                  <Building2 className="w-4 h-4 ml-1" /> مكتب
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address" className="flex items-center gap-1">
                العنوان
                {addressLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="أدخل العنوان" className="text-right" />
              <p className="text-xs text-muted-foreground">💡 يتم اقتراح العنوان تلقائياً من الإحداثيات</p>
            </div>

            <Collapsible open={showMap} onOpenChange={setShowMap}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className={`w-full justify-between ${(latitude === null || latitude === undefined) ? 'border-destructive' : 'border-primary/30'} hover:bg-primary/5`}>
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    تحديد الموقع على الخريطة *
                    {latitude !== null && latitude !== undefined && <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">✓</span>}
                  </span>
                  {showMap ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <LazyLocationPicker onLocationChange={handleLocationChange} latitude={latitude} longitude={longitude} defaultWilaya={wilaya || undefined} />
                {latitude && longitude && (
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    الإحداثيات: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
            {(latitude === null || latitude === undefined) && <p className="text-xs text-destructive">يجب تحديد الموقع الجغرافي</p>}
          </div>

          {/* --- Section: Finance & Preferences --- */}
          <div className="space-y-4 rounded-xl border-2 border-amber-500/20 bg-amber-500/5 p-4">
            <Label className="font-bold flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <CreditCard className="w-4 h-4" />
              الوضعية المالية والتفضيلات
            </Label>

            <div className="space-y-2">
              <Label className="text-xs">الدين (دج)</Label>
              <Input type="number" min="0" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} placeholder="0" className="text-right" dir="ltr" />
              {debtSummary && debtSummary.count > 0 && (
                <p className="text-xs text-muted-foreground">{debtSummary.count} سند(ات) نشطة</p>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <Label htmlFor="edit-registered-switch">عميل مسجل (ملف تجاري)</Label>
                </div>
                <Switch id="edit-registered-switch" checked={isRegistered} onCheckedChange={setIsRegistered} />
              </div>
              {isRegistered && (
                <p className="text-xs text-muted-foreground">✅ هذا العميل مسجل رسمياً ويمكنه الشراء بـ Facture 1</p>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <Label htmlFor="edit-trust-switch">عميل موثوق (البيع بالدين)</Label>
                </div>
                <Switch id="edit-trust-switch" checked={isTrusted} onCheckedChange={setIsTrusted} />
              </div>
              {isTrusted && (
                <Input value={trustNotes} onChange={(e) => setTrustNotes(e.target.value)} placeholder="ملاحظات حول حالة الثقة (اختياري)" className="text-right" />
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-background/60">
              <div className="space-y-2">
                <Label className="text-sm">نوع الشراء الافتراضي</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={defaultPaymentType === 'with_invoice' ? 'default' : 'outline'} size="sm" onClick={() => setDefaultPaymentType('with_invoice')}>Facture 1</Button>
                  <Button type="button" variant={defaultPaymentType === 'without_invoice' ? 'default' : 'outline'} size="sm" onClick={() => setDefaultPaymentType('without_invoice')}>Facture 2</Button>
                </div>
              </div>
              {defaultPaymentType === 'without_invoice' && (
                <div className="space-y-2">
                  <Label className="text-sm">تسعير Facture 2</Label>
                  <div className="grid grid-cols-3 gap-2">
                     <Button type="button" variant={defaultPriceSubtype === 'super_gros' ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setDefaultPriceSubtype('super_gros')}>Super Gros</Button>
                     <Button type="button" variant={defaultPriceSubtype === 'gros' ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setDefaultPriceSubtype('gros')}>Gros</Button>
                     <Button type="button" variant={defaultPriceSubtype === 'retail' ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setDefaultPriceSubtype('retail')}>Détail</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 z-20 bg-background border-t pt-3 pb-1 -mx-6 px-6">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomerDialog;
