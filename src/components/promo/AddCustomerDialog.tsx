import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Loader2, MapPin, ChevronDown, ChevronUp, Store, Building2, Warehouse, CreditCard, User, UserCircle, Shield, Languages, Plus, Trash2, Type, BookOpen } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Customer } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { ALGERIAN_WILAYAS, DEFAULT_WILAYA } from '@/data/algerianWilayas';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';
import { useSectors } from '@/hooks/useSectors';
import { useCreateDebt } from '@/hooks/useCustomerDebts';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { reverseGeocode } from '@/utils/geoUtils';

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// Detect if text is Arabic
const isArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

const AddCustomerDialog: React.FC<AddCustomerDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { workerId, activeBranch, role } = useAuth();
  const { t } = useLanguage();
  const { sectors, fetchSectors } = useSectors();
  const createDebt = useCreateDebt();
  const { trackVisit } = useTrackVisit();
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
  const [wilaya, setWilaya] = useState(DEFAULT_WILAYA);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gpsGranted, setGpsGranted] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [searchAddressQuery, setSearchAddressQuery] = useState('');
  const [locationType, setLocationType] = useState<'store' | 'warehouse' | 'office'>('store');
  const [debtAmount, setDebtAmount] = useState('');
  const [salesReps, setSalesReps] = useState<SalesRep[]>([{ name: '', phone: '' }]);
  const [internalName, setInternalName] = useState('');
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustNotes, setTrustNotes] = useState('');
  const [defaultPaymentType, setDefaultPaymentType] = useState<string>('without_invoice'); // default: فاتورة 2
  const [defaultPriceSubtype, setDefaultPriceSubtype] = useState<string>('retail'); // default: تجزئة
  const effectiveBranchId = activeBranch ? activeBranch.id : null;

  // Fetch zones when sector changes
  const [zonesLoading, setZonesLoading] = useState(false);
  useEffect(() => {
    setZoneId('');
    if (!sectorId) {
      setZones([]);
      return;
    }
    setZonesLoading(true);
    supabase.from('sector_zones').select('id, name, sector_id').eq('sector_id', sectorId).order('name')
      .then(({ data, error }) => {
        console.log('🔍 Zones fetch for sector', sectorId, ':', data, error);
        setZones(data || []);
        setZonesLoading(false);
      });
  }, [sectorId]);

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
    if (open) {
      fetchSectors().catch(() => { });
      setName('');
      setNameFr('');
      setStoreName('');
      setStoreNameFr('');
      setSectorId('');
      setZoneId('');
      setZones([]);
      setPhones(['']);
      setAddress('');
      setWilaya(DEFAULT_WILAYA);
      setLatitude(null);
      setLongitude(null);
      setShowMap(true);
      setSearchAddressQuery('');
      setLocationType('store');
      setDebtAmount('');
      setSalesReps([{ name: '', phone: '' }]);
      setInternalName('');
      setIsTrusted(false);
      setTrustNotes('');
      setDefaultPaymentType('without_invoice');
      setDefaultPriceSubtype('retail');
      setGpsGranted(false);
      setGpsLoading(true);
      // Auto-capture GPS
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setLatitude(lat);
            setLongitude(lng);
            setGpsGranted(true);
            setGpsLoading(false);
            fetchAddressFromCoords(lat, lng);
          },
          (err) => {
            console.warn('GPS auto-capture failed:', err.message);
            setGpsGranted(false);
            setGpsLoading(false);
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      } else {
        setGpsGranted(false);
        setGpsLoading(false);
      }
    }
  }, [open]);

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

  // Translate helper
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

  // Auto-translate name on blur (bidirectional like store name)
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

  // Auto-translate store name on blur (bidirectional)
  const handleStoreNameBlur = async () => {
    if (!storeName.trim()) return;
    setTranslatingStore(true);
    if (isArabic(storeName.trim())) {
      // Arabic → French
      const result = await translateText(storeName.trim(), 'ar', 'fr');
      if (result) setStoreNameFr(result);
    } else {
      // French/English → Arabic
      const result = await translateText(storeName.trim(), 'fr', 'ar');
      if (result) setStoreNameFr(storeName.trim()); // keep original as "fr"
      // Actually swap: the original is FR, translate to AR
      const arResult = await translateText(storeName.trim(), 'fr', 'ar');
      if (arResult) {
        setStoreNameFr(storeName.trim()); // original goes to FR field
        setStoreName(arResult); // Arabic version in main field
      }
    }
    setTranslatingStore(false);
  };

  const handleLocationChange = (lat: number, lng: number, addressFromMap?: string) => {
    setLatitude(lat);
    setLongitude(lng);
    if (addressFromMap) {
      const parts = addressFromMap.split(',').map(p => p.trim()).filter(Boolean);
      setAddress(parts.join(' - '));
    } else {
      fetchAddressFromCoords(lat, lng);
    }
  };

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

    if (!name.trim()) { toast.error('الرجاء إدخال اسم العميل'); return; }
    if (!phones[0]?.trim()) { toast.error('الرجاء إدخال رقم هاتف العميل'); return; }
    if (!storeName.trim()) { toast.error('الرجاء إدخال اسم المحل'); return; }
    if (!sectorId || sectorId === 'none') { toast.error('الرجاء اختيار السكتور'); return; }
    if (!latitude || !longitude) { toast.error('يرجى تحديد الموقع الجغرافي على الخريطة'); return; }

    setIsLoading(true);
    try {
      // Combine phones with separator
      const phoneStr = phones.filter(p => p.trim()).join(' / ');
      // Combine sales reps
      const repsNames = salesReps.filter(r => r.name.trim()).map(r => r.name.trim()).join(' / ');
      const repsPhones = salesReps.filter(r => r.phone.trim()).map(r => r.phone.trim()).join(' / ');

      const payload = {
        name: name.trim(),
        name_fr: nameFr.trim() || null,
        store_name: storeName.trim() || null,
        store_name_fr: storeNameFr.trim() || null,
        phone: phoneStr || null,
        address: address.trim() || null,
        wilaya,
        branch_id: effectiveBranchId,
        created_by: workerId,
        latitude, longitude,
        location_type: locationType,
        sector_id: sectorId,
        zone_id: zoneId || null,
        sales_rep_name: repsNames || null,
        sales_rep_phone: repsPhones || null,
        internal_name: internalName.trim() || null,
        is_trusted: isTrusted,
        trust_notes: trustNotes.trim() || null,
        default_payment_type: defaultPaymentType,
        default_price_subtype: defaultPriceSubtype,
      };

      // Workers must go through approval, admins/branch_admins can add directly
      const isManager = role === 'admin' || role === 'branch_admin';

      if (isManager) {
        const { data, error } = await supabase.from('customers').insert(payload).select().single();
        if (error) throw error;

        const debt = parseFloat(debtAmount);
        if (debt > 0 && workerId) {
          await createDebt.mutateAsync({
            customer_id: data.id, worker_id: workerId,
            branch_id: effectiveBranchId || undefined,
            total_amount: debt, paid_amount: 0,
            notes: 'دين أولي عند إنشاء العميل',
          });
        }

        toast.success(t('customers.add') + ' ✓');
        trackVisit({ customerId: data.id, operationType: 'add_customer', operationId: data.id });
        onSuccess(data as Customer);
      } else {
        // Worker: create approval request instead of direct insert
        const approvalPayload = {
          ...payload,
          initial_debt: parseFloat(debtAmount) || 0,
        };
        const { error } = await supabase
          .from('customer_approval_requests')
          .insert({
            operation_type: 'insert',
            payload: approvalPayload,
            requested_by: workerId,
            branch_id: effectiveBranchId || null,
            status: 'pending'
          } as any);
        if (error) throw error;
        trackVisit({ customerId: null, operationType: 'add_customer', notes: `طلب إضافة عميل: ${name.trim()}` });
        toast.success('تم إرسال طلب إضافة العميل للمراجعة');
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Error adding customer:', error);
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            {t('customers.add_new')}
          </DialogTitle>
        </DialogHeader>

        {/* GPS Required Gate */}
        {!gpsGranted ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
            {gpsLoading ? (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">جارٍ تحديد موقعك الحالي...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-destructive" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg">يجب تفعيل خدمة الموقع (GPS)</h3>
                  <p className="text-sm text-muted-foreground max-w-[250px]">
                    لا يمكن إضافة عميل جديد بدون تحديد الموقع الجغرافي. يرجى تفعيل GPS والمحاولة مرة أخرى.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="default"
                  className="gap-2"
                  onClick={() => {
                    setGpsLoading(true);
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          setLatitude(position.coords.latitude);
                          setLongitude(position.coords.longitude);
                          setGpsGranted(true);
                          setGpsLoading(false);
                          fetchAddressFromCoords(position.coords.latitude, position.coords.longitude);
                          toast.success('تم تحديد الموقع بنجاح');
                        },
                        () => {
                          setGpsLoading(false);
                          toast.error('فشل الحصول على الموقع. تأكد من تفعيل GPS في إعدادات الجهاز');
                        },
                        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
                      );
                    } else {
                      setGpsLoading(false);
                    }
                  }}
                >
                  <MapPin className="w-4 h-4" />
                  إعادة المحاولة
                </Button>
              </>
            )}
          </div>
        ) : (
        <>
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
              <Label htmlFor="customer-name">{t('customers.name')} *</Label>
              <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={handleNameBlur} placeholder={t('customers.name')} className="text-right" autoFocus required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-name-fr" className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" />
                اسم العميل بالفرنسية
                {translatingName && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="customer-name-fr" value={nameFr} onChange={(e) => setNameFr(e.target.value)} placeholder="Nom du client (Français)" className="text-left" dir="ltr" />
            </div>

            {/* Phone numbers - multiple */}
            <div className="space-y-2">
              <Label>{t('common.phone')} الخاص بالزبون *</Label>
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
                <Label htmlFor="store-name">اسم المحل *</Label>
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
              <Input id="store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} onBlur={handleStoreNameBlur} placeholder="اسم المحل (عربي أو فرنسي)" className="text-right" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-name-fr" className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" />
                اسم المحل بالفرنسية
                {translatingStore && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="store-name-fr" value={storeNameFr} onChange={(e) => setStoreNameFr(e.target.value)} placeholder="Nom du magasin (Français)" className="text-left" dir="ltr" />
            </div>


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

          {/* --- Section 2: Finance & Preferences --- */}
          <div className="space-y-4 rounded-xl border-2 border-amber-500/20 bg-amber-500/5 p-4">
            <Label className="font-bold flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <CreditCard className="w-4 h-4" />
              الوضعية المالية والتفضيلات
            </Label>

            <div className="space-y-2">
              <Label className="text-xs">الدين الابتدائي (دج)</Label>
              <Input type="number" min="0" step="0.01" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} placeholder="0" className="text-right" dir="ltr" />
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <Label htmlFor="trust-switch">عميل موثوق (البيع بالدين)</Label>
                </div>
                <Switch id="trust-switch" checked={isTrusted} onCheckedChange={setIsTrusted} />
              </div>
              {isTrusted && (
                <Input value={trustNotes} onChange={(e) => setTrustNotes(e.target.value)} placeholder="ملاحظات حول حالة الثقة (اختياري)" className="text-right" />
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-background/60">
              <div className="space-y-2">
                <Label className="text-sm">نوع الشراء الافتراضي</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={defaultPaymentType === 'with_invoice' ? 'default' : 'outline'} size="sm" onClick={() => setDefaultPaymentType('with_invoice')}>فاتورة 1</Button>
                  <Button type="button" variant={defaultPaymentType === 'without_invoice' ? 'default' : 'outline'} size="sm" onClick={() => setDefaultPaymentType('without_invoice')}>فاتورة 2</Button>
                </div>
              </div>
              {defaultPaymentType === 'without_invoice' && (
                <div className="space-y-2">
                  <Label className="text-sm">تسعير فاتورة 2</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant={defaultPriceSubtype === 'super_gros' ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setDefaultPriceSubtype('super_gros')}>سوبر غرو</Button>
                    <Button type="button" variant={defaultPriceSubtype === 'gros' ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setDefaultPriceSubtype('gros')}>غرو</Button>
                    <Button type="button" variant={defaultPriceSubtype === 'retail' ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setDefaultPriceSubtype('retail')}>تجزئة</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* --- Section 3: Location & Sector --- */}
          <div className="space-y-4 rounded-xl border-2 border-emerald-500/20 bg-emerald-500/5 p-4">
            <Label className="font-bold flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <MapPin className="w-4 h-4" />
              تفاصيل الموقع والسكتور
            </Label>

            <div className="space-y-2">
              <Label>السكتور *</Label>
              <Select value={sectorId || ''} onValueChange={(val) => setSectorId(val)}>
                <SelectTrigger className={!sectorId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="اختر السكتور" />
                </SelectTrigger>
                <SelectContent position="popper" className="bg-popover z-[10050] max-h-60">
                  {sectors.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!sectorId && <p className="text-xs text-destructive">يجب اختيار سكتور</p>}
            </div>

            {/* Zone selection - always show when sector selected */}
            {sectorId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  المنطقة داخل السكتور
                  {zonesLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </Label>
                <Select value={zoneId || 'none'} onValueChange={(val) => setZoneId(val === 'none' ? '' : val)} disabled={zonesLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={zonesLoading ? 'جاري التحميل...' : zones.length === 0 ? 'لا توجد مناطق' : 'اختر المنطقة'} />
                  </SelectTrigger>
                  <SelectContent position="popper" className="bg-popover z-[10050] max-h-60">
                    <SelectItem value="none">بدون تحديد</SelectItem>
                    {zones.map(z => (
                      <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('customers.wilaya')}</Label>
              <Select value={wilaya} onValueChange={setWilaya}>
                <SelectTrigger>
                  <SelectValue placeholder={t('customers.select_wilaya')} />
                </SelectTrigger>
                <SelectContent position="popper" className="bg-popover z-[10050] max-h-60">
                  {ALGERIAN_WILAYAS.map((w) => (
                    <SelectItem key={w.code} value={w.name}>{w.code} - {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {role === 'admin' && activeBranch && (
              <div className="p-3 bg-background/60 rounded-lg border">
                <p className="text-sm text-muted-foreground">{t('nav.branches')}</p>
                <p className="font-medium">{activeBranch.name}</p>
              </div>
            )}

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
              <Label htmlFor="customer-address" className="flex items-center gap-1">
                {t('common.address')}
                {addressLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input id="customer-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('common.address')} className="text-right" />
              <p className="text-xs text-muted-foreground">💡 يتم اقتراح العنوان تلقائياً من الإحداثيات مع إمكانية التعديل</p>
            </div>

            {/* Location Map Section */}
            <Collapsible open={showMap} onOpenChange={(isOpen) => { setShowMap(isOpen); if (isOpen && address.trim()) setSearchAddressQuery(address.trim()); }}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className={`w-full justify-between ${!(latitude && longitude) ? 'border-destructive' : 'border-primary/30'} hover:bg-primary/5`}>
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span>تحديد الموقع على الخريطة (GPS) *</span>
                    {latitude && longitude && <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">✓</span>}
                  </span>
                  {showMap ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <LazyLocationPicker latitude={latitude} longitude={longitude} onLocationChange={handleLocationChange} initialSearchQuery={searchAddressQuery} addressToSearch={address} defaultWilaya={activeBranch?.wilaya} />
              </CollapsibleContent>
            </Collapsible>
            {!(latitude && longitude) && <p className="text-xs text-destructive">يجب تحديد الموقع الجغرافي</p>}
          </div>

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-2 -mb-2 border-t mt-4 pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (<><Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('common.loading')}</>) : t('common.add')}
            </Button>
          </div>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCustomerDialog;
