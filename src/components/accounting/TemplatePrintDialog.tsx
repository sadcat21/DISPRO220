import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Printer, Minus, Plus } from 'lucide-react';

export interface TemplatePrintConfig {
  pageCount: number;
  productName: string;
  offerDetail: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: { id: string; name: string }[];
  offers: { productId: string; detail: string }[];
  onPrint: (config: TemplatePrintConfig) => void;
}

const TemplatePrintDialog: React.FC<Props> = ({ open, onOpenChange, products, offers, onPrint }) => {
  const [pageCount, setPageCount] = useState(2);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [customProduct, setCustomProduct] = useState('');
  const [selectedOffer, setSelectedOffer] = useState('');
  const [customOffer, setCustomOffer] = useState('');

  const productName = selectedProductId === '__custom'
    ? customProduct
    : selectedProductId
      ? (products.find(p => p.id === selectedProductId)?.name || '')
      : '';

  const offerDetail = selectedOffer === '__custom'
    ? customOffer
    : selectedOffer || '';

  // Filter offers by selected product
  const filteredOffers = selectedProductId && selectedProductId !== '__custom'
    ? offers.filter(o => o.productId === selectedProductId)
    : [];

  const handlePrint = () => {
    onPrint({ pageCount, productName, offerDetail });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            طباعة نموذج فارغ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Page count */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">عدد الصفحات</Label>
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setPageCount(p => Math.max(1, p - 1))}
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="text-lg font-bold min-w-[40px] text-center">{pageCount}</span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setPageCount(p => Math.min(20, p + 1))}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Product selection */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">اسم المنتج (اختياري)</Label>
            <Select value={selectedProductId} onValueChange={(v) => { setSelectedProductId(v); setSelectedOffer(''); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="اتركه فارغاً للكتابة اليدوية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">فارغ (كتابة يدوية)</SelectItem>
                <SelectItem value="__custom">إدخال يدوي...</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProductId === '__custom' && (
              <Input
                placeholder="أدخل اسم المنتج..."
                value={customProduct}
                onChange={e => setCustomProduct(e.target.value)}
                className="h-8 text-sm"
                dir="ltr"
              />
            )}
          </div>

          {/* Offer/tier selection */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">نوع العرض / الشريحة (اختياري)</Label>
            {filteredOffers.length > 0 ? (
              <Select value={selectedOffer} onValueChange={setSelectedOffer}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="اتركه فارغاً للكتابة اليدوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">فارغ (كتابة يدوية)</SelectItem>
                  <SelectItem value="__custom">إدخال يدوي...</SelectItem>
                  {filteredOffers.map((o, i) => (
                    <SelectItem key={i} value={o.detail}>{o.detail}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={selectedOffer} onValueChange={setSelectedOffer}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="اتركه فارغاً للكتابة اليدوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">فارغ (كتابة يدوية)</SelectItem>
                  <SelectItem value="__custom">إدخال يدوي...</SelectItem>
                </SelectContent>
              </Select>
            )}
            {selectedOffer === '__custom' && (
              <Input
                placeholder="مثال: 50BOX+1BOX"
                value={customOffer}
                onChange={e => setCustomOffer(e.target.value)}
                className="h-8 text-sm"
                dir="ltr"
              />
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" />
            طباعة النموذج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePrintDialog;
