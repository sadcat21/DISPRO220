import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Loader2, MapPin, ChevronDown, ChevronUp, Store, Building2, Warehouse, CreditCard, User, UserCircle, Shield, Tag, Languages } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Customer, Branch } from '@/types/database';
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

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (customer: Customer) => void;
}

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
  const [sectorId, setSectorId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [wilaya, setWilaya] = useState(DEFAULT_WILAYA);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [searchAddressQuery, setSearchAddressQuery] = useState('');
  const [locationType, setLocationType] = useState<'store' | 'warehouse' | 'office'>('store');
  const [debtAmount, setDebtAmount] = useState('');
  const [salesRepName, setSalesRepName] = useState('');
  const [salesRepPhone, setSalesRepPhone] = useState('');
  const [internalName, setInternalName] = useState('');
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustNotes, setTrustNotes] = useState('');
  const [defaultPaymentType, setDefaultPaymentType] = useState<string>('without_invoice');
  const [defaultPriceSubtype, setDefaultPriceSubtype] = useState<string>('gros');
  const effectiveBranchId = activeBranch ? activeBranch.id : null;

  // Completion percentage
  const completionPercent = useMemo(() => {
    const requiredFields = [
      !!name.trim(),
      !!phone.trim(),
      !!storeName.trim(),
      !!(sectorId && sectorId !== 'none'),
      !!(latitude && longitude),
    ];
    const optionalFields = [
      !!address.trim(),
      !!wilaya,
      !!nameFr.trim(),
      !!internalName.trim(),
      !!salesRepName.trim(),
    ];
    const filledRequired = requiredFields.filter(Boolean).length;
    const filledOptional = optionalFields.filter(Boolean).length;
    const total = requiredFields.length + optionalFields.length;
    return Math.round(((filledRequired + filledOptional) / total) * 100);
  }, [name, phone, storeName, sectorId, latitude, longitude, address, wilaya, nameFr, internalName, salesRepName]);

  useEffect(() => {
    if (open) {
      fetchSectors().catch(() => { });
      setName('');
      setNameFr('');
      setStoreName('');
      setSectorId('');
      setPhone('');
      setAddress('');
      setWilaya(DEFAULT_WILAYA);
      setLatitude(null);
      setLongitude(null);
      setShowMap(true);
      setSearchAddressQuery('');
      setLocationType('store');
      setDebtAmount('');
      setSalesRepName('');
      setSalesRepPhone('');
      setInternalName('');
      setIsTrusted(false);
      setTrustNotes('');
      setDefaultPaymentType('without_invoice');
      setDefaultPriceSubtype('gros');
      // Auto-capture GPS - required
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLatitude(position.coords.latitude);
            setLongitude(position.coords.longitude);
          },
          (err) => {
            console.warn('GPS auto-capture failed:', err.message);
            toast.error('يرجى تفعيل خدمة الموقع (GPS) لإضافة عميل جديد');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        toast.error('المتصفح لا يدعم خدمة الموقع (GPS)');
      }
    }
  }, [open]);

  // Auto-translate Arabic name to French on blur
  const handleNameBlur = async () => {
    if (!name.trim() || nameFr.trim()) return; // Don't overwrite if already filled
    setTranslatingName(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text: name.trim(), sourceLang: 'ar', targetLangs: ['fr'] },
      });
      if (!error && data?.translations?.fr) {
        setNameFr(data.translations.fr);
      }
    } catch {
      // Silent fail
    } finally {
      setTranslatingName(false);
    }
  };

  const handleLocationChange = (lat: number, lng: number, addressFromMap?: string) => {
    setLatitude(lat);
    setLongitude(lng);
    if (addressFromMap) {
      const parts = addressFromMap.split(',').map(p => p.trim()).filter(Boolean);
      const formattedAddress = parts.join(' - ');
      setAddress(formattedAddress);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('الرجاء إدخال اسم العميل');
      return;
    }
    if (!phone.trim()) {
      toast.error('الرجاء إدخال رقم هاتف العميل');
      return;
    }
    if (!storeName.trim()) {
      toast.error('الرجاء إدخال اسم المحل');
      return;
    }
    if (!sectorId || sectorId === 'none') {
      toast.error('الرجاء اختيار السكتور');
      return;
    }
    if (!latitude || !longitude) {
      toast.error('يرجى تحديد الموقع الجغرافي على الخريطة');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        name: name.trim(),
        name_fr: nameFr.trim() || null,
        store_name: storeName.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        wilaya: wilaya,
        branch_id: effectiveBranchId,
        created_by: workerId,
        latitude: latitude,
        longitude: longitude,
        location_type: locationType,
        sector_id: sectorId,
        sales_rep_name: salesRepName.trim() || null,
        sales_rep_phone: salesRepPhone.trim() || null,
        internal_name: internalName.trim() || null,
        is_trusted: isTrusted,
        trust_notes: trustNotes.trim() || null,
        default_payment_type: defaultPaymentType,
        default_price_subtype: defaultPriceSubtype,
      };

      const { data, error } = await supabase
        .from('customers')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // Create initial debt if amount > 0
      const debt = parseFloat(debtAmount);
      if (debt > 0 && workerId) {
        await createDebt.mutateAsync({
          customer_id: data.id,
          worker_id: workerId,
          branch_id: effectiveBranchId || undefined,
          total_amount: debt,
          paid_amount: 0,
          notes: 'دين أولي عند إنشاء العميل',
        });
      }

      toast.success(t('customers.add') + ' ✓');
      trackVisit({ customerId: data.id, operationType: 'add_customer', operationId: data.id });
      onSuccess(data as Customer);
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

        {/* Completion Bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">اكتمال البيانات</span>
            <span className="text-xs font-semibold text-primary">{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} className="h-2" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* --- Section 1: Basic Info & Contact --- */}
          <div className="space-y-4 border-b pb-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">{t('customers.name')} *</Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder={t('customers.name')}
                className="text-right"
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-name-fr" className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" />
                اسم العميل بالفرنسية
                {translatingName && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              <Input
                id="customer-name-fr"
                value={nameFr}
                onChange={(e) => setNameFr(e.target.value)}
                placeholder="Nom du client (Français)"
                className="text-left"
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-phone">{t('common.phone')} الخاص بالزبون *</Label>
              <Input
                id="customer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('common.phone')}
                className="text-right"
                dir="ltr"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-name">اسم المحل *</Label>
              <Input
                id="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="اسم المحل التجاري"
                className="text-right"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-primary" />
                الاسم الداخلي (للفريق فقط)
              </Label>
              <Input
                value={internalName}
                onChange={(e) => setInternalName(e.target.value)}
                placeholder="اسم مختصر أو لقب داخلي..."
                className="text-right"
              />
              <p className="text-xs text-muted-foreground">هذا الاسم يظهر لفريق العمل فقط ولا يراه التاجر</p>
            </div>

            <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <Label className="flex items-center gap-1 text-sm font-semibold">
                <User className="w-3.5 h-3.5" />
                مسؤول المبيعات / المشتريات (عند الزبون)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={salesRepName}
                  onChange={(e) => setSalesRepName(e.target.value)}
                  placeholder="الاسم"
                  className="text-right text-sm"
                />
                <Input
                  value={salesRepPhone}
                  onChange={(e) => setSalesRepPhone(e.target.value)}
                  placeholder="رقم الهاتف"
                  className="text-right text-sm"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* --- Section 2: Finance & Preferences --- */}
          <div className="space-y-4 border-b pb-4">
            <Label className="font-bold flex items-center gap-2 text-sm">
              <CreditCard className="w-4 h-4 text-primary" />
              الوضعية المالية والتفضيلات
            </Label>

            <div className="space-y-2">
              <Label className="text-xs">الدين الابتدائي (دج)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
                placeholder="0"
                className="text-right"
                dir="ltr"
              />
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <Label htmlFor="trust-switch">عميل موثوق (البيع بالدين)</Label>
                </div>
                <Switch
                  id="trust-switch"
                  checked={isTrusted}
                  onCheckedChange={setIsTrusted}
                />
              </div>
              {isTrusted && (
                <Input
                  value={trustNotes}
                  onChange={(e) => setTrustNotes(e.target.value)}
                  placeholder="ملاحظات حول حالة الثقة (اختياري)"
                  className="text-right"
                />
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="space-y-2">
                <Label className="text-sm">نوع الشراء الافتراضي</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={defaultPaymentType === 'with_invoice' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDefaultPaymentType('with_invoice')}
                  >
                    فاتورة 1
                  </Button>
                  <Button
                    type="button"
                    variant={defaultPaymentType === 'without_invoice' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDefaultPaymentType('without_invoice')}
                  >
                    فاتورة 2
                  </Button>
                </div>
              </div>
              {defaultPaymentType === 'without_invoice' && (
                <div className="space-y-2">
                  <Label className="text-sm">تسعير فاتورة 2</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={defaultPriceSubtype === 'super_gros' ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => setDefaultPriceSubtype('super_gros')}
                    >
                      سوبر غرو
                    </Button>
                    <Button
                      type="button"
                      variant={defaultPriceSubtype === 'gros' ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => setDefaultPriceSubtype('gros')}
                    >
                      غرو
                    </Button>
                    <Button
                      type="button"
                      variant={defaultPriceSubtype === 'retail' ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => setDefaultPriceSubtype('retail')}
                    >
                      تجزئة
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* --- Section 3: Location & Sector --- */}
          <div className="space-y-4">
            <Label className="font-bold flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-primary" />
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

            <div className="space-y-2">
              <Label>{t('customers.wilaya')}</Label>
              <Select value={wilaya} onValueChange={setWilaya}>
                <SelectTrigger>
                  <SelectValue placeholder={t('customers.select_wilaya')} />
                </SelectTrigger>
                <SelectContent position="popper" className="bg-popover z-[10050] max-h-60">
                  {ALGERIAN_WILAYAS.map((w) => (
                    <SelectItem key={w.code} value={w.name}>
                      {w.code} - {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {role === 'admin' && activeBranch && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground">{t('nav.branches')}</p>
                <p className="font-medium">{activeBranch.name}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>نوع الموقع</Label>
              <div className="flex gap-2">
                <Button type="button" variant={locationType === 'store' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('store')}>
                  <Store className="w-4 h-4 ml-1" />
                  محل
                </Button>
                <Button type="button" variant={locationType === 'warehouse' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('warehouse')}>
                  <Warehouse className="w-4 h-4 ml-1" />
                  مخزن
                </Button>
                <Button type="button" variant={locationType === 'office' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('office')}>
                  <Building2 className="w-4 h-4 ml-1" />
                  مكتب
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-address">{t('common.address')}</Label>
              <Input
                id="customer-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('common.address')}
                className="text-right"
              />
              <p className="text-xs text-muted-foreground">
                💡 افتح الخريطة أدناه للبحث عن هذا العنوان أو تحديد الموقع يدوياً
              </p>
            </div>

            {/* Location Map Section */}
            <Collapsible
              open={showMap}
              onOpenChange={(isOpen) => {
                setShowMap(isOpen);
                if (isOpen && address.trim()) {
                  setSearchAddressQuery(address.trim());
                }
              }}
            >
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className={`w-full justify-between ${!(latitude && longitude) ? 'border-destructive' : 'border-primary/30'} hover:bg-primary/5`}>
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span>تحديد الموقع على الخريطة (GPS) *</span>
                    {latitude && longitude && (
                      <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">✓</span>
                    )}
                  </span>
                  {showMap ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <LazyLocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  onLocationChange={handleLocationChange}
                  initialSearchQuery={searchAddressQuery}
                  addressToSearch={address}
                  defaultWilaya={activeBranch?.wilaya}
                />
              </CollapsibleContent>
            </Collapsible>
            {!(latitude && longitude) && <p className="text-xs text-destructive">يجب تحديد الموقع الجغرافي</p>}

          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.add')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddCustomerDialog;
