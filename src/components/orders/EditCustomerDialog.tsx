import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Store, Building2, Warehouse, ChevronDown, ChevronUp, CreditCard, User, Languages } from 'lucide-react';
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

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSuccess: (customer: Customer) => void;
}

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
  const { workerId } = useAuth();
  const [name, setName] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [translatingName, setTranslatingName] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [wilaya, setWilaya] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [locationType, setLocationType] = useState<'store' | 'warehouse' | 'office'>('store');
  const [salesRepName, setSalesRepName] = useState('');
  const [salesRepPhone, setSalesRepPhone] = useState('');
  const [debtAmount, setDebtAmount] = useState('');

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
      !!salesRepName.trim(),
    ];
    const total = requiredFields.length + optionalFields.length;
    const filled = [...requiredFields, ...optionalFields].filter(Boolean).length;
    return Math.round((filled / total) * 100);
  }, [name, phone, storeName, sectorId, latitude, longitude, address, wilaya, nameFr, salesRepName]);

  // Sync debt amount when summary loads
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
      setSectorId(customer.sector_id || '');
      setPhone(customer.phone || '');
      setAddress(customer.address || '');
      setWilaya(customer.wilaya || '');
      setLatitude(customer.latitude);
      setLongitude(customer.longitude);
      setLocationType((customer as any).location_type || 'store');
      setSalesRepName(customer.sales_rep_name || '');
      setSalesRepPhone(customer.sales_rep_phone || '');
      setShowMap(!!(customer.latitude && customer.longitude));
    }
  }, [open, customer]);

  // Auto-translate Arabic name to French on blur
  const handleNameBlur = async () => {
    if (!name.trim() || nameFr.trim()) return;
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

  const handleLocationChange = (lat: number, lng: number, addressText?: string) => {
    setLatitude(lat);
    setLongitude(lng);
    if (addressText) {
      const parts = addressText.split(',').map(p => p.trim()).filter(Boolean);
      const formattedAddress = parts.join(' - ');
      setAddress(formattedAddress);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customer) return;
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
        wilaya: wilaya || null,
        latitude,
        longitude,
        location_type: locationType,
        sector_id: sectorId,
        sales_rep_name: salesRepName.trim() || null,
        sales_rep_phone: salesRepPhone.trim() || null,
      };
      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', customer.id)
        .select()
        .single();

      if (error) throw error;

      // Handle debt changes
      const currentDebt = debtSummary?.totalDebt || 0;
      const newDebt = parseFloat(debtAmount) || 0;
      const difference = newDebt - currentDebt;

      if (difference > 0 && workerId) {
        await createDebt.mutateAsync({
          customer_id: customer.id,
          worker_id: workerId,
          total_amount: difference,
          paid_amount: 0,
          notes: 'تعديل دين من بيانات العميل',
        });
      } else if (difference < 0 && workerId) {
        const absDiff = Math.abs(difference);
        const { data: activeDebts } = await supabase
          .from('customer_debts')
          .select('id, total_amount, paid_amount, remaining_amount')
          .eq('customer_id', customer.id)
          .eq('status', 'active')
          .order('created_at', { ascending: true });

        if (activeDebts && activeDebts.length > 0) {
          let remainingPayment = absDiff;
          for (const debt of activeDebts) {
            if (remainingPayment <= 0) break;
            const debtRemaining = Number(debt.remaining_amount) || (Number(debt.total_amount) - Number(debt.paid_amount));
            const payAmount = Math.min(remainingPayment, debtRemaining);
            if (payAmount > 0) {
              await updateDebtPayment.mutateAsync({
                debtId: debt.id,
                amount: payAmount,
                workerId,
                paymentMethod: 'cash',
                notes: 'تخفيض دين من بيانات العميل',
              });
              remainingPayment -= payAmount;
            }
          }
        }
      }

      toast.success('تم تحديث بيانات العميل بنجاح');
      onSuccess(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('فشل في تحديث بيانات العميل');
    } finally {
      setIsLoading(false);
    }
  };

  const locationTypes = [
    { value: 'store', label: 'محل', icon: Store },
    { value: 'warehouse', label: 'مخزن', icon: Warehouse },
    { value: 'office', label: 'مكتب', icon: Building2 },
  ];

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
          <div className="space-y-2">
            <Label htmlFor="edit-name">اسم العميل *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="أدخل اسم العميل"
              className="text-right"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name-fr" className="flex items-center gap-1">
              <Languages className="w-3.5 h-3.5" />
              اسم العميل بالفرنسية
              {translatingName && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </Label>
            <Input
              id="edit-name-fr"
              value={nameFr}
              onChange={(e) => setNameFr(e.target.value)}
              placeholder="Nom du client (Français)"
              className="text-left"
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-store-name">اسم المحل *</Label>
            <Input
              id="edit-store-name"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="اسم المحل التجاري"
              className="text-right"
              required
            />
          </div>

          {sectors.length > 0 && (
            <div className="space-y-2">
              <Label>السكتور *</Label>
              <Select value={sectorId || ''} onValueChange={setSectorId}>
                <SelectTrigger className={!sectorId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="اختر السكتور" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[100]">
                  {sectors.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!sectorId && <p className="text-xs text-destructive">يجب اختيار سكتور</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-phone">هاتف العميل *</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0XXX XXX XXX"
              className="text-right"
              dir="ltr"
              required
            />
          </div>

          {/* Sales Representative */}
          <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
            <Label className="flex items-center gap-1 text-sm font-semibold">
              <User className="w-3.5 h-3.5" />
              مسؤول المبيعات
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

          {/* Debt - Editable */}
          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <Label className="flex items-center gap-1 text-sm font-semibold">
              <CreditCard className="w-3.5 h-3.5" />
              الدين (دج)
            </Label>
            <Input
              type="number"
              min="0"
              value={debtAmount}
              onChange={(e) => setDebtAmount(e.target.value)}
              placeholder="0"
              className="text-right"
              dir="ltr"
            />
            {debtSummary && debtSummary.count > 0 && (
              <p className="text-xs text-muted-foreground">{debtSummary.count} سند(ات) نشطة</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-wilaya">الولاية</Label>
            <Select value={wilaya} onValueChange={setWilaya}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الولاية" />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100] bg-popover max-h-60">
                {ALGERIAN_WILAYAS.map((w) => (
                  <SelectItem key={w.code} value={w.name}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">العنوان</Label>
            <Input
              id="edit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="أدخل العنوان"
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label>نوع الموقع</Label>
            <div className="grid grid-cols-3 gap-2">
              {locationTypes.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={locationType === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLocationType(type.value as any)}
                  className="flex flex-col h-14 gap-1"
                >
                  <type.icon className="w-4 h-4" />
                  <span className="text-xs">{type.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Location Picker */}
          <Collapsible open={showMap} onOpenChange={setShowMap}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className={`w-full justify-between ${!(latitude && longitude) ? 'border-destructive' : ''}`}>
                <span className="flex items-center gap-2">
                  تحديد الموقع على الخريطة *
                  {latitude && longitude && (
                    <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">✓</span>
                  )}
                </span>
                {showMap ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="h-64 rounded-lg overflow-hidden border">
                <LazyLocationPicker
                  onLocationChange={handleLocationChange}
                  latitude={latitude}
                  longitude={longitude}
                  defaultWilaya={wilaya || undefined}
                />
              </div>
              {latitude && longitude && (
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  الإحداثيات: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
          {!(latitude && longitude) && <p className="text-xs text-destructive">يجب تحديد الموقع الجغرافي</p>}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            حفظ التعديلات
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomerDialog;
