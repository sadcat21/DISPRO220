import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePromoSplits, PromoSplitWithDetails } from '@/hooks/usePromoSplits';
import { useProductOffers } from '@/hooks/useProductOffers';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

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
  const [offerId, setOfferId] = useState<string>('');
  const [productId, setProductId] = useState('');
  const [targetQty, setTargetQty] = useState('');
  const [targetUnit, setTargetUnit] = useState('box');
  const [giftQty, setGiftQty] = useState('');
  const [giftUnit, setGiftUnit] = useState('box');
  const [adjustedGift, setAdjustedGift] = useState('');
  const [giftProductId, setGiftProductId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, pieces_per_box').eq('is_active', true).order('name');
      return data || [];
    },
  });

  useEffect(() => {
    if (editSplit) {
      setName(editSplit.name);
      setSplitType(editSplit.split_type);
      setOfferId(editSplit.offer_id || '');
      setProductId(editSplit.product_id);
      setTargetQty(String(editSplit.target_quantity));
      setTargetUnit(editSplit.target_quantity_unit);
      setGiftQty(String(editSplit.gift_quantity));
      setGiftUnit(editSplit.gift_quantity_unit);
      setAdjustedGift(editSplit.adjusted_gift_quantity != null ? String(editSplit.adjusted_gift_quantity) : '');
      setGiftProductId(editSplit.gift_product_id || '');
      setNotes(editSplit.notes || '');
    } else {
      setName(''); setSplitType('quantity_accumulation'); setOfferId('');
      setProductId(''); setTargetQty(''); setTargetUnit('box');
      setGiftQty(''); setGiftUnit('box'); setAdjustedGift('');
      setGiftProductId(''); setNotes('');
    }
  }, [editSplit, open]);

  // Auto-fill from selected offer
  useEffect(() => {
    if (offerId) {
      const offer = activeOffers.find(o => o.id === offerId);
      if (offer) {
        setProductId(offer.product_id);
        setTargetQty(String(offer.min_quantity));
        setTargetUnit(offer.min_quantity_unit || 'box');
        setGiftQty(String(offer.gift_quantity));
        setGiftUnit(offer.gift_quantity_unit || 'box');
        if (offer.gift_product_id) setGiftProductId(offer.gift_product_id);
        if (!name) setName(`تجزئة: ${offer.name}`);
      }
    }
  }, [offerId]);

  const handleSave = async () => {
    if (!name || !productId || !targetQty || !giftQty) return;
    setSaving(true);
    try {
      const payload: any = {
        name,
        split_type: splitType,
        offer_id: offerId || null,
        product_id: productId,
        target_quantity: Number(targetQty),
        target_quantity_unit: targetUnit,
        gift_quantity: Number(giftQty),
        gift_quantity_unit: giftUnit,
        adjusted_gift_quantity: adjustedGift ? Number(adjustedGift) : null,
        gift_product_id: giftProductId || null,
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
                <SelectItem value="customer_group">تجميع عملاء (عدة عملاء - تقسيم الهدية)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Offer selection */}
          <div className="space-y-1">
            <Label>العرض المرتبط (اختياري)</Label>
            <Select value={offerId} onValueChange={setOfferId}>
              <SelectTrigger><SelectValue placeholder="اختر العرض..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون عرض</SelectItem>
                {activeOffers.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.name} - {o.product?.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              <Label>كمية الهدية الأصلية *</Label>
              <Input type="number" value={giftQty} onChange={e => setGiftQty(e.target.value)} placeholder="25" />
            </div>
            <div className="space-y-1">
              <Label>وحدة الهدية</Label>
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
            <Label>كمية الهدية المعدلة (اختياري - خصم المدير)</Label>
            <Input type="number" value={adjustedGift} onChange={e => setAdjustedGift(e.target.value)} placeholder="مثال: 20 بدلا من 25" />
          </div>

          {/* Gift Product */}
          <div className="space-y-1">
            <Label>منتج الهدية (اختياري)</Label>
            <Select value={giftProductId} onValueChange={setGiftProductId}>
              <SelectTrigger><SelectValue placeholder="نفس المنتج" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">نفس المنتج</SelectItem>
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
