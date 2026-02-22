import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, Package, Gift, ShoppingCart, Edit3, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Product } from '@/types/database';
import { cn } from '@/lib/utils';

interface OfferGiftInfo {
  giftQuantity: number; // gift boxes
  giftPieces: number;   // total gift pieces
  offerId?: string;
}

interface StockOverflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  requestedQuantity: number;
  availableQuantity: number;
  originalGift: OfferGiftInfo | null; // gift based on requested quantity
  deliveredGift: OfferGiftInfo | null; // gift based on available quantity
  onConfirm: (
    deliveredQty: number,
    giftInfo: OfferGiftInfo | null,
    createOrderForExcess: boolean,
    excessQty: number,
    offerNote: string | null,
  ) => void;
  calculateGiftForQuantity: (qty: number) => { giftPieces: number; giftBoxes: number };
}

const StockOverflowDialog: React.FC<StockOverflowDialogProps> = ({
  open,
  onOpenChange,
  product,
  requestedQuantity,
  availableQuantity,
  originalGift,
  deliveredGift,
  onConfirm,
  calculateGiftForQuantity,
}) => {
  const { t, dir } = useLanguage();
  const [createOrder, setCreateOrder] = useState(true);
  const [offerChoice, setOfferChoice] = useState<'recalculate' | 'keep_original' | 'manual'>('recalculate');
  const [manualGiftQty, setManualGiftQty] = useState(0);
  const [manualGiftUnit, setManualGiftUnit] = useState<'box' | 'piece'>('box');

  const excessQty = requestedQuantity - availableQuantity;
  const hasOffer = originalGift && (originalGift.giftQuantity > 0 || originalGift.giftPieces > 0);

  // Recalculate gift when choice changes
  const effectiveGift = useMemo((): OfferGiftInfo | null => {
    if (!hasOffer) return null;

    switch (offerChoice) {
      case 'recalculate':
        return deliveredGift;
      case 'keep_original':
        return originalGift;
      case 'manual': {
        if (manualGiftUnit === 'box') {
          const piecesPerBox = product?.pieces_per_box || 1;
          return { giftQuantity: manualGiftQty, giftPieces: manualGiftQty * piecesPerBox };
        } else {
          const piecesPerBox = product?.pieces_per_box || 1;
          const boxes = piecesPerBox > 0 ? Math.floor(manualGiftQty / piecesPerBox) : 0;
          return { giftQuantity: boxes, giftPieces: manualGiftQty };
        }
      }
      default:
        return deliveredGift;
    }
  }, [offerChoice, deliveredGift, originalGift, hasOffer, manualGiftQty, manualGiftUnit, product]);

  useEffect(() => {
    if (open) {
      setOfferChoice('recalculate');
      setCreateOrder(true);
      setManualGiftQty(deliveredGift?.giftQuantity || 0);
      setManualGiftUnit('box');
    }
  }, [open, deliveredGift]);

  if (!product) return null;

  const getOfferNote = (): string | null => {
    if (!hasOffer) return null;
    if (offerChoice === 'keep_original') {
      return `⚠️ عرض تم تمريره رغم عدم توافق الكمية المسلمة (${availableQuantity}) مع الكمية المطلوبة (${requestedQuantity})`;
    }
    if (offerChoice === 'manual') {
      const unitLabel = manualGiftUnit === 'box' ? 'صندوق' : 'قطعة';
      return `✏️ عرض معدل يدوياً: ${manualGiftQty} ${unitLabel} (الكمية المسلمة: ${availableQuantity} من ${requestedQuantity})`;
    }
    return null;
  };

  const handleConfirm = () => {
    onConfirm(
      availableQuantity,
      effectiveGift,
      createOrder,
      excessQty,
      getOfferNote(),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir={dir}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            الكمية غير متوفرة بالكامل
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stock Info */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
            <p className="font-bold text-sm">{product.name}</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">المطلوبة</p>
                <p className="font-bold text-lg">{requestedQuantity}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">المتوفرة</p>
                <p className="font-bold text-lg text-green-600">{availableQuantity}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">الناقصة</p>
                <p className="font-bold text-lg text-destructive">{excessQty}</p>
              </div>
            </div>
          </div>

          {/* Create Order for Excess */}
          <div
            className={cn(
              "border rounded-lg p-3 cursor-pointer transition-colors",
              createOrder ? "border-primary bg-primary/5" : "border-border"
            )}
            onClick={() => setCreateOrder(!createOrder)}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center",
                createOrder ? "border-primary bg-primary" : "border-muted-foreground"
              )}>
                {createOrder && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4" />
                  إنشاء طلبية بالكمية الناقصة
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  سيتم إنشاء طلبية بـ {excessQty} {t('offers.unit_box')} لنفس العميل
                </p>
              </div>
            </div>
          </div>

          {/* Offer Recalculation Options */}
          {hasOffer && (
            <div className="space-y-3">
              <Label className="font-semibold flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-green-600" />
                خيارات العرض
              </Label>

              <div className="bg-muted/30 rounded-lg p-2 text-xs space-y-1">
                <p>العرض الأصلي ({requestedQuantity} صندوق): <strong className="text-green-600">{originalGift?.giftQuantity || 0} {t('offers.unit_box')}</strong>
                  {originalGift && originalGift.giftPieces % (product.pieces_per_box || 1) > 0 && (
                    <> + {originalGift.giftPieces % (product.pieces_per_box || 1)} {t('offers.unit_piece')}</>
                  )}
                </p>
                <p>العرض المعاد حسابه ({availableQuantity} صندوق): <strong className="text-blue-600">{deliveredGift?.giftQuantity || 0} {t('offers.unit_box')}</strong>
                  {deliveredGift && deliveredGift.giftPieces % (product.pieces_per_box || 1) > 0 && (
                    <> + {deliveredGift.giftPieces % (product.pieces_per_box || 1)} {t('offers.unit_piece')}</>
                  )}
                </p>
              </div>

              <RadioGroup value={offerChoice} onValueChange={(v) => setOfferChoice(v as any)} className="space-y-2">
                {/* Option 1: Recalculate */}
                <div className={cn(
                  "flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition-colors",
                  offerChoice === 'recalculate' ? "border-primary bg-primary/5" : "border-border"
                )} onClick={() => setOfferChoice('recalculate')}>
                  <RadioGroupItem value="recalculate" id="recalc" className="mt-0.5" />
                  <div>
                    <Label htmlFor="recalc" className="font-medium text-sm cursor-pointer">
                      حساب العرض حسب الكمية المسلمة
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      هدية: {deliveredGift?.giftQuantity || 0} {t('offers.unit_box')}
                      {deliveredGift && deliveredGift.giftPieces % (product.pieces_per_box || 1) > 0 && (
                        <> + {deliveredGift.giftPieces % (product.pieces_per_box || 1)} {t('offers.unit_piece')}</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Option 2: Keep Original */}
                <div className={cn(
                  "flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition-colors",
                  offerChoice === 'keep_original' ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : "border-border"
                )} onClick={() => setOfferChoice('keep_original')}>
                  <RadioGroupItem value="keep_original" id="keep" className="mt-0.5" />
                  <div>
                    <Label htmlFor="keep" className="font-medium text-sm cursor-pointer">
                      تمرير العرض كما هو
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      هدية: {originalGift?.giftQuantity || 0} {t('offers.unit_box')} (رغم عدم توافق الكمية)
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px] border-amber-500 text-amber-600">
                      ⚠️ سيظهر تنبيه للمديرين
                    </Badge>
                  </div>
                </div>

                {/* Option 3: Manual */}
                <div className={cn(
                  "flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition-colors",
                  offerChoice === 'manual' ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-border"
                )} onClick={() => setOfferChoice('manual')}>
                  <RadioGroupItem value="manual" id="manual" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="manual" className="font-medium text-sm cursor-pointer flex items-center gap-1">
                      <Edit3 className="w-3.5 h-3.5" />
                      تعديل العرض يدوياً
                    </Label>
                    {offerChoice === 'manual' && (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={manualGiftQty}
                          onChange={(e) => setManualGiftQty(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 h-8 text-sm"
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant={manualGiftUnit === 'box' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 text-xs px-2"
                            onClick={(e) => { e.stopPropagation(); setManualGiftUnit('box'); }}
                          >
                            {t('offers.unit_box')}
                          </Button>
                          <Button
                            type="button"
                            variant={manualGiftUnit === 'piece' ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 text-xs px-2"
                            onClick={(e) => { e.stopPropagation(); setManualGiftUnit('piece'); }}
                          >
                            {t('offers.unit_piece')}
                          </Button>
                        </div>
                      </div>
                    )}
                    <Badge variant="outline" className="mt-1 text-[10px] border-blue-500 text-blue-600">
                      ✏️ سيظهر تنبيه للمديرين
                    </Badge>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-semibold">ملخص العملية:</p>
            <div className="flex justify-between">
              <span>الكمية المسلمة:</span>
              <span className="font-bold">{availableQuantity} {t('offers.unit_box')}</span>
            </div>
            {effectiveGift && (effectiveGift.giftQuantity > 0 || effectiveGift.giftPieces > 0) && (
              <div className="flex justify-between text-green-600">
                <span>الهدية:</span>
                <span className="font-bold">
                  {effectiveGift.giftQuantity > 0 ? `${effectiveGift.giftQuantity} ${t('offers.unit_box')}` : ''}
                  {effectiveGift.giftQuantity > 0 && effectiveGift.giftPieces % (product?.pieces_per_box || 1) > 0 ? ' + ' : ''}
                  {effectiveGift.giftPieces % (product?.pieces_per_box || 1) > 0 ? `${effectiveGift.giftPieces % (product?.pieces_per_box || 1)} ${t('offers.unit_piece')}` : ''}
                </span>
              </div>
            )}
            {createOrder && (
              <div className="flex justify-between text-blue-600">
                <span>طلبية جديدة:</span>
                <span className="font-bold">{excessQty} {t('offers.unit_box')}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="w-4 h-4 ms-2" />
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StockOverflowDialog;
