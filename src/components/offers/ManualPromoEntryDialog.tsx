import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Gift, User, Package, Layers, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/database';
import { toast } from 'sonner';

type UnitType = 'box' | 'piece';

type OfferTierOption = {
  id?: string;
  min_quantity: number;
  max_quantity: number | null;
  min_quantity_unit: UnitType;
  gift_quantity: number;
  gift_quantity_unit: UnitType;
  tier_order: number;
};

type OfferOption = {
  id: string;
  name: string;
  condition_type: 'range' | 'multiplier';
  product_id: string;
  branch_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  product?: { id: string; name: string; pieces_per_box?: number | null } | null;
  tiers?: OfferTierOption[];
  min_quantity: number;
  max_quantity: number | null;
  min_quantity_unit: UnitType;
  gift_quantity: number;
  gift_quantity_unit: UnitType;
};

interface ManualPromoEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCustomerId?: string;
}

const unitLabel = (unit: UnitType) => (unit === 'box' ? 'صندوق' : 'قطعة');

const buildOfferDetail = (tier: OfferTierOption) => {
  const minUnit = tier.min_quantity_unit === 'box' ? 'BOX' : 'PCS';
  const giftUnit = tier.gift_quantity_unit === 'box' ? 'BOX' : 'PCS';
  return `${tier.min_quantity}${minUnit}+${tier.gift_quantity}${giftUnit}`;
};

const ManualPromoEntryDialog: React.FC<ManualPromoEntryDialogProps> = ({
  open,
  onOpenChange,
  initialCustomerId,
}) => {
  const { workerId, activeBranch } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [offers, setOffers] = useState<OfferOption[]>([]);

  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [selectedTierId, setSelectedTierId] = useState('');
  const [soldQuantity, setSoldQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const productOptions = useMemo(() => {
    const seen = new Set<string>();
    return offers
      .filter((offer) => {
        if (!offer.product?.id || !offer.product?.name) return false;
        if (seen.has(offer.product.id)) return false;
        seen.add(offer.product.id);
        return true;
      })
      .map((offer) => ({ id: offer.product!.id, name: offer.product!.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [offers]);

  const productOffers = useMemo(
    () => offers.filter((offer) => offer.product_id === selectedProductId),
    [offers, selectedProductId],
  );

  const selectedOffer = useMemo(
    () => productOffers.find((offer) => offer.id === selectedOfferId) || null,
    [productOffers, selectedOfferId],
  );

  const availableTiers = useMemo(() => {
    if (!selectedOffer) return [];
    const sorted = [...(selectedOffer.tiers || [])].sort((a, b) => a.tier_order - b.tier_order);
    if (sorted.length > 0) return sorted;

    return [
      {
        min_quantity: selectedOffer.min_quantity,
        max_quantity: selectedOffer.max_quantity,
        min_quantity_unit: selectedOffer.min_quantity_unit,
        gift_quantity: selectedOffer.gift_quantity,
        gift_quantity_unit: selectedOffer.gift_quantity_unit,
        tier_order: 0,
      } as OfferTierOption,
    ];
  }, [selectedOffer]);

  const selectedTier = useMemo(
    () => availableTiers.find((tier) => (tier.id || `tier-${tier.tier_order}`) === selectedTierId) || null,
    [availableTiers, selectedTierId],
  );

  const soldQtyValue = Number(soldQuantity || 0);

  const giftEstimation = useMemo(() => {
    if (!selectedOffer || !selectedTier || soldQtyValue <= 0) {
      return { giftQty: 0, eligible: false, timesApplied: 0 };
    }

    const minQty = Number(selectedTier.min_quantity || 0);
    if (minQty <= 0) return { giftQty: 0, eligible: false, timesApplied: 0 };

    if (selectedOffer.condition_type === 'multiplier') {
      const timesApplied = Math.floor(soldQtyValue / minQty);
      return {
        giftQty: timesApplied * Number(selectedTier.gift_quantity || 0),
        eligible: timesApplied > 0,
        timesApplied,
      };
    }

    const inRange = soldQtyValue >= minQty && (selectedTier.max_quantity == null || soldQtyValue <= selectedTier.max_quantity);
    return {
      giftQty: inRange ? Number(selectedTier.gift_quantity || 0) : 0,
      eligible: inRange,
      timesApplied: inRange ? 1 : 0,
    };
  }, [selectedOffer, selectedTier, soldQtyValue]);

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        let customersQuery = supabase
          .from('customers')
          .select('*')
          .eq('status', 'active')
          .order('name');

        if (activeBranch?.id) {
          customersQuery = customersQuery.eq('branch_id', activeBranch.id);
        }

        const offersQuery = supabase
          .from('product_offers')
          .select(`
            id, name, condition_type, product_id, branch_id, start_date, end_date,
            min_quantity, max_quantity, min_quantity_unit, gift_quantity, gift_quantity_unit,
            product:products!product_offers_product_id_fkey(id, name, pieces_per_box),
            tiers:product_offer_tiers(id, min_quantity, max_quantity, min_quantity_unit, gift_quantity, gift_quantity_unit, tier_order)
          `)
          .eq('is_active', true)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false });

        const [{ data: customersData, error: customersError }, { data: offersData, error: offersError }] = await Promise.all([
          customersQuery,
          offersQuery,
        ]);

        if (customersError) throw customersError;
        if (offersError) throw offersError;

        const branchFilteredOffers = (offersData || []).filter((offer: any) => {
          if (!activeBranch?.id) return true;
          return !offer.branch_id || offer.branch_id === activeBranch.id;
        });

        const dateFilteredOffers = branchFilteredOffers.filter((offer: any) => {
          const startOk = !offer.start_date || offer.start_date <= today;
          const endOk = !offer.end_date || offer.end_date >= today;
          return startOk && endOk;
        });

        setCustomers((customersData || []) as Customer[]);
        setOffers(dateFilteredOffers as any);
      } catch (error) {
        console.error('Error fetching manual promo data:', error);
        toast.error('فشل تحميل بيانات تسجيل العروض اليدوية');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [open, activeBranch?.id, today]);

  useEffect(() => {
    if (!open) return;
    setSelectedCustomerId(initialCustomerId || '');
    setSelectedProductId('');
    setSelectedOfferId('');
    setSelectedTierId('');
    setSoldQuantity('');
    setNotes('');
  }, [open, initialCustomerId]);

  useEffect(() => {
    if (!selectedProductId) {
      setSelectedOfferId('');
      setSelectedTierId('');
      return;
    }

    const firstOffer = productOffers[0];
    setSelectedOfferId(firstOffer?.id || '');
  }, [selectedProductId, productOffers]);

  useEffect(() => {
    if (!selectedOffer) {
      setSelectedTierId('');
      return;
    }

    const firstTier = availableTiers[0];
    setSelectedTierId(firstTier ? (firstTier.id || `tier-${firstTier.tier_order}`) : '');
  }, [selectedOffer, availableTiers]);

  const handleSave = async () => {
    if (!workerId) {
      toast.error('تعذر تحديد العامل الحالي');
      return;
    }
    if (!selectedCustomerId || !selectedProductId || !selectedOffer || !selectedTier) {
      toast.error('يرجى إكمال الحقول المطلوبة');
      return;
    }
    if (soldQtyValue <= 0) {
      toast.error('يرجى إدخال كمية مباعة صحيحة');
      return;
    }
    if (!giftEstimation.eligible || giftEstimation.giftQty <= 0) {
      toast.error('الكمية المباعة لا تحقق شروط الشريحة المحددة');
      return;
    }

    setIsSaving(true);
    try {
      const detail = buildOfferDetail(selectedTier);
      const payload = {
        worker_id: workerId,
        customer_id: selectedCustomerId,
        product_id: selectedProductId,
        vente_quantity: soldQtyValue,
        gratuite_quantity: giftEstimation.giftQty,
        gift_quantity_unit: selectedTier.gift_quantity_unit || 'piece',
        offer_id: selectedOffer.id,
        offer_tier_id: selectedTier.id || null,
        offer_detail: detail,
        notes: notes.trim() || null,
      };

      const { error } = await supabase.from('promos').insert(payload as any);
      if (error) throw error;

      toast.success('تم تسجيل العرض اليدوي بنجاح');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving manual promo:', error);
      toast.error(error.message || 'فشل حفظ تسجيل العرض اليدوي');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            تسجيل عروض/هدايا يدويًا
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><User className="w-4 h-4" /> العميل *</Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedCustomer ? selectedCustomer.name : 'اختر العميل'}
                    <ChevronsUpDown className="w-4 h-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="ابحث عن عميل..." className="text-right" dir="rtl" />
                    <CommandList>
                      <CommandEmpty>لا يوجد عميل مطابق</CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.name}
                            onSelect={() => {
                              setSelectedCustomerId(customer.id);
                              setCustomerPopoverOpen(false);
                            }}
                            className="text-right"
                            dir="rtl"
                          >
                            <Check className={cn('me-2 h-4 w-4', selectedCustomerId === customer.id ? 'opacity-100' : 'opacity-0')} />
                            <span>{customer.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Package className="w-4 h-4" /> المنتج (عليه عروض) *</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المنتج" />
                </SelectTrigger>
                <SelectContent>
                  {productOptions.map((product) => (
                    <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>العرض *</Label>
              <Select value={selectedOfferId} onValueChange={setSelectedOfferId} disabled={!selectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر العرض" />
                </SelectTrigger>
                <SelectContent>
                  {productOffers.map((offer) => (
                    <SelectItem key={offer.id} value={offer.id}>{offer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Layers className="w-4 h-4" /> شريحة العرض *</Label>
              <Select value={selectedTierId} onValueChange={setSelectedTierId} disabled={!selectedOffer}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشريحة" />
                </SelectTrigger>
                <SelectContent>
                  {availableTiers.map((tier) => {
                    const key = tier.id || `tier-${tier.tier_order}`;
                    return (
                      <SelectItem key={key} value={key}>
                        {`شريحة ${tier.tier_order + 1}: ${tier.min_quantity} ${unitLabel(tier.min_quantity_unit)} + ${tier.gift_quantity} ${unitLabel(tier.gift_quantity_unit)}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الكمية المباعة ({unitLabel(selectedTier?.min_quantity_unit || 'box')}) *</Label>
              <Input
                type="number"
                min="0"
                value={soldQuantity}
                onChange={(e) => setSoldQuantity(e.target.value)}
                placeholder="أدخل الكمية المباعة"
              />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">نوع الاحتساب</span>
                <Badge variant="outline">{selectedOffer?.condition_type === 'multiplier' ? 'مضاعف' : 'مدى'}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">التطبيق</span>
                <span className="font-semibold">{giftEstimation.timesApplied} مرة</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">الهدية المستنتجة</span>
                <span className="font-bold text-primary">
                  {giftEstimation.giftQty} {unitLabel(selectedTier?.gift_quantity_unit || 'piece')}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أضف ملاحظة..."
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManualPromoEntryDialog;
