import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePromoSplits, PromoSplitWithDetails } from '@/hooks/usePromoSplits';
import { useProductOffers } from '@/hooks/useProductOffers';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSplit: PromoSplitWithDetails | null;
}

const CreatePromoSplitDialog: React.FC<Props> = ({ open, onOpenChange, editSplit }) => {
  const { createSplit, updateSplit } = usePromoSplits();
  const { activeOffers } = useProductOffers();
  const { workerId, activeBranch } = useAuth();

  const [name, setName] = useState('');
  const [splitType, setSplitType] = useState<string>('quantity_accumulation');
  const [offerId, setOfferId] = useState<string>('none');
  const [selectedTierIndex, setSelectedTierIndex] = useState<string>('0');
  const [productId, setProductId] = useState('');
  const [targetQty, setTargetQty] = useState('');
  const [targetUnit, setTargetUnit] = useState('box');
  const [giftQty, setGiftQty] = useState('');
  const [giftUnit, setGiftUnit] = useState('box');
  const [adjustedGift, setAdjustedGift] = useState('');
  const [giftProductId, setGiftProductId] = useState('none');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, pieces_per_box').eq('is_active', true).order('name');
      return data || [];
    },
  });

  // Get the selected offer and its tiers
  const selectedOffer = useMemo(() => {
    if (!offerId || offerId === 'none') return null;
    return activeOffers.find(o => o.id === offerId) || null;
  }, [offerId, activeOffers]);

  const offerTiers = useMemo(() => {
    if (!selectedOffer?.tiers?.length) return [];
    return selectedOffer.tiers;
  }, [selectedOffer]);

  useEffect(() => {
    if (editSplit) {
      setName(editSplit.name);
      setSplitType(editSplit.split_type);
      setOfferId(editSplit.offer_id || 'none');
      setProductId(editSplit.product_id);
      setTargetQty(String(editSplit.target_quantity));
      setTargetUnit(editSplit.target_quantity_unit);
      setGiftQty(String(editSplit.gift_quantity));
      setGiftUnit(editSplit.gift_quantity_unit);
      setAdjustedGift(editSplit.adjusted_gift_quantity != null ? String(editSplit.adjusted_gift_quantity) : '');
      setGiftProductId(editSplit.gift_product_id || 'none');
      setNotes(editSplit.notes || '');
      setSelectedTierIndex('0');
    } else {
      setName(''); setSplitType('quantity_accumulation'); setOfferId('none');
      setProductId(''); setTargetQty(''); setTargetUnit('box');
      setGiftQty(''); setGiftUnit('box'); setAdjustedGift('');
      setGiftProductId('none'); setNotes(''); setSelectedTierIndex('0');
    }
  }, [editSplit, open]);

  // Auto-fill from selected offer/tier
  useEffect(() => {
    if (!offerId || offerId === 'none') return;
    const offer = activeOffers.find(o => o.id === offerId);
    if (!offer) return;

    setProductId(offer.product_id);

    // If offer has tiers, use the selected tier
    if (offer.tiers?.length) {
      const tierIdx = parseInt(selectedTierIndex) || 0;
      const tier = offer.tiers[tierIdx];
      if (tier) {
        setTargetQty(String(tier.min_quantity));
        setTargetUnit(tier.min_quantity_unit || 'box');
        setGiftQty(String(tier.gift_quantity));
        setGiftUnit(tier.gift_quantity_unit || 'box');
        if (tier.gift_product_id) setGiftProductId(tier.gift_product_id);
      }
    } else {
      // Fallback to offer-level values
      setTargetQty(String(offer.min_quantity));
      setTargetUnit(offer.min_quantity_unit || 'box');
      setGiftQty(String(offer.gift_quantity));
      setGiftUnit(offer.gift_quantity_unit || 'box');
      if (offer.gift_product_id) setGiftProductId(offer.gift_product_id);
    }

    if (!name) setName(`تجزئة: ${offer.name}`);
  }, [offerId, selectedTierIndex]);

  const handleSave = async () => {
    if (!name || !productId || !targetQty || !giftQty) return;
    setSaving(true);
    try {
      const payload: any = {
        name,
        split_type: splitType,
        offer_id: offerId && offerId !== 'none' ? offerId : null,
        product_id: productId,
        target_quantity: Number(targetQty),
        target_quantity_unit: targetUnit,
        gift_quantity: Number(giftQty),
        gift_quantity_unit: giftUnit,
        adjusted_gift_quantity: adjustedGift ? Number(adjustedGift) : null,
        gift_product_id: giftProductId && giftProductId !== 'none' ? giftProductId : null,
        notes: notes || null,
        branch_id: activeBranch?.id || null,
        created_by: workerId || null,
      };

      if (editSplit) {
        await updateSplit(editSplit.id, payload);
      } else {
        await createSplit(payload);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const formatTierLabel = (tier: any, index: number) => {
    const unit = tier.min_quantity_unit === 'piece' ? 'قطعة' : 'صندوق';
    const gUnit = tier.gift_quantity_unit === 'piece' ? 'قطعة' : 'صندوق';
    const maxLabel = tier.max_quantity ? ` → ${tier.max_quantity}` : '+';
    return `شريحة ${index + 1}: ${tier.min_quantity}${maxLabel} ${unit} = ${tier.gift_quantity} ${gUnit} عرض`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editSplit ? 'تعديل التجزئة' : 'إنشاء تجزئة عرض'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <Label>الاسم *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: تجزئة عرض الألف صندوق" />
          </div>

          {/* Split Type */}
          <div className="space-y-1">
            <Label>نوع التجزئة *</Label>
            <Select value={splitType} onValueChange={setSplitType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quantity_accumulation">تجميع كميات (عميل واحد - دفعات)</SelectItem>
                <SelectItem value="customer_group">تجميع عملاء (عدة عملاء - تقسيم العرض)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Offer selection */}
          <div className="space-y-1">
            <Label>العرض المرتبط (اختياري)</Label>
            <Select value={offerId} onValueChange={(v) => { setOfferId(v); setSelectedTierIndex('0'); }}>
              <SelectTrigger><SelectValue placeholder="اختر العرض..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون عرض</SelectItem>
                {activeOffers.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} - {o.product?.name}
                    {o.tiers && o.tiers.length > 1 ? ` (${o.tiers.length} شرائح)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tier selection - show when offer has multiple tiers */}
          {offerTiers.length > 0 && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                اختر الشريحة ({offerTiers.length} شرائح متاحة)
              </Label>
              <div className="space-y-1.5">
                {offerTiers.map((tier, idx) => (
                  <div
                    key={tier.id || idx}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedTierIndex === String(idx)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                    onClick={() => setSelectedTierIndex(String(idx))}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedTierIndex === String(idx)
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    }`}>
                      {selectedTierIndex === String(idx) && (
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{formatTierLabel(tier, idx)}</p>
                      {tier.gift_type === 'different_product' && tier.gift_product_id && (
                        <p className="text-[10px] text-muted-foreground">منتج مختلف</p>
                      )}
                    </div>
                    {selectedTierIndex === String(idx) && (
                      <Badge variant="default" className="text-[9px] shrink-0">محدد</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product */}
          <div className="space-y-1">
            <Label>المنتج *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="اختر المنتج..." /></SelectTrigger>
              <SelectContent>
                {products?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Quantity */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>الكمية المستهدفة *</Label>
              <Input type="number" value={targetQty} onChange={e => setTargetQty(e.target.value)} placeholder="1000" />
            </div>
            <div className="space-y-1">
              <Label>الوحدة</Label>
              <Select value={targetUnit} onValueChange={setTargetUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">صندوق</SelectItem>
                  <SelectItem value="piece">قطعة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Gift Quantity */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>كمية العرض الأصلية *</Label>
              <Input type="number" value={giftQty} onChange={e => setGiftQty(e.target.value)} placeholder="25" />
            </div>
            <div className="space-y-1">
              <Label>وحدة العرض</Label>
              <Select value={giftUnit} onValueChange={setGiftUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">صندوق</SelectItem>
                  <SelectItem value="piece">قطعة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Adjusted Gift */}
          <div className="space-y-1">
            <Label>كمية العرض المعدلة (اختياري - خصم المدير)</Label>
            <Input type="number" value={adjustedGift} onChange={e => setAdjustedGift(e.target.value)} placeholder="مثال: 20 بدلا من 25" />
          </div>

          {/* Gift Product */}
          <div className="space-y-1">
            <Label>منتج العرض (اختياري)</Label>
            <Select value={giftProductId} onValueChange={setGiftProductId}>
              <SelectTrigger><SelectValue placeholder="نفس المنتج" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">نفس المنتج</SelectItem>
                {products?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || !name || !productId || !targetQty || !giftQty}>
            {saving ? 'جاري الحفظ...' : editSplit ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePromoSplitDialog;
