import React, { useState, useCallback, useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Minus, Package, Gift, Check, Settings2, Receipt, ReceiptText } from 'lucide-react';
import { Product, PaymentType, PriceSubType } from '@/types/database';
import { InvoicePaymentMethod } from '@/types/stamp';
import { useLanguage } from '@/contexts/LanguageContext';
import ProductOfferBadge from '@/components/offers/ProductOfferBadge';
import InvoicePaymentMethodSelect from '@/components/orders/InvoicePaymentMethodSelect';

export interface GiftInfo {
  giftQuantity: number;
  giftPieces: number;
  offerId?: string;
}

export interface PerItemPricing {
  paymentType: PaymentType;
  invoicePaymentMethod: InvoicePaymentMethod | null;
  priceSubType: PriceSubType;
}

interface ProductQuantityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (productId: string, quantity: number, giftInfo?: GiftInfo, isUnitSale?: boolean, perItemPricing?: PerItemPricing) => void;
  unitPrice?: number;
  unitPiecePrice?: number;
  defaultPaymentType?: PaymentType;
  defaultPriceSubType?: PriceSubType;
  defaultInvoicePaymentMethod?: InvoicePaymentMethod | null;
  initialQuantity?: number;
}

const ProductQuantityDialog: React.FC<ProductQuantityDialogProps> = ({
  open,
  onOpenChange,
  product,
  onConfirm,
  unitPrice = 0,
  unitPiecePrice = 0,
  defaultPaymentType = 'with_invoice',
  defaultPriceSubType = 'gros',
  defaultInvoicePaymentMethod = null,
  initialQuantity = 1,
}) => {
  const { t, dir } = useLanguage();
  const [quantity, setQuantity] = useState(initialQuantity);
  const [giftPieces, setGiftPieces] = useState(0);
  const [giftOfferId, setGiftOfferId] = useState<string | undefined>(undefined);
  const [offerApplied, setOfferApplied] = useState(false);
  const [isUnitSale, setIsUnitSale] = useState(false);
  const [showPricingOverride, setShowPricingOverride] = useState(false);
  const [itemPaymentType, setItemPaymentType] = useState<PaymentType>(defaultPaymentType);
  const [itemPriceSubType, setItemPriceSubType] = useState<PriceSubType>(defaultPriceSubType);
  const [itemInvoicePaymentMethod, setItemInvoicePaymentMethod] = useState<InvoicePaymentMethod | null>(defaultInvoicePaymentMethod);

  // Sync quantity when initialQuantity changes (edit mode vs new)
  useEffect(() => {
    if (open) {
      setQuantity(initialQuantity);
    }
  }, [open, initialQuantity]);

  // Offer must be applied before confirming (mandatory)
  const hasUnappliedOffer = !isUnitSale && giftPieces > 0 && !offerApplied;

  const handleConfirm = () => {
    if (product && quantity > 0 && !hasUnappliedOffer) {
      const perItemPricing: PerItemPricing | undefined = showPricingOverride ? {
        paymentType: itemPaymentType,
        invoicePaymentMethod: itemPaymentType === 'with_invoice' ? itemInvoicePaymentMethod : null,
        priceSubType: itemPriceSubType,
      } : undefined;

      if (isUnitSale) {
        onConfirm(product.id, quantity, undefined, true, perItemPricing);
      } else {
        const giftBoxes = product.pieces_per_box > 0 ? Math.floor(giftPieces / product.pieces_per_box) : 0;
        const hasGifts = giftPieces > 0 || giftBoxes > 0;
        if (hasGifts && offerApplied) {
          onConfirm(product.id, quantity, { giftQuantity: giftBoxes, giftPieces, offerId: giftOfferId }, false, perItemPricing);
        } else {
          onConfirm(product.id, quantity, undefined, false, perItemPricing);
        }
      }
      setQuantity(1);
      setGiftPieces(0);
      setGiftOfferId(undefined);
      setOfferApplied(false);
      setIsUnitSale(false);
      setShowPricingOverride(false);
      onOpenChange(false);
    }
  };

  const handleQuantityChange = (delta: number) => {
    if (offerApplied) setOfferApplied(false);
    setQuantity(Math.max(1, quantity + delta));
  };

  const handleGiftCalculated = useCallback((pieces: number, offerId?: string) => {
    setGiftPieces(pieces);
    setGiftOfferId(offerId);
    setOfferApplied(false);
  }, []);

  const handleApplyOffer = () => {
    if (!product || giftPieces <= 0) return;
    const giftBoxes = product.pieces_per_box > 0 ? Math.floor(giftPieces / product.pieces_per_box) : 0;
    if (giftBoxes > 0) setQuantity(prev => prev + giftBoxes);
    setOfferApplied(true); // Apply even if giftBoxes is 0 (piece-level gifts)
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setGiftPieces(0);
      setGiftOfferId(undefined);
      setQuantity(initialQuantity);
      setOfferApplied(false);
      setIsUnitSale(false);
      setShowPricingOverride(false);
      setItemPaymentType(defaultPaymentType);
      setItemPriceSubType(defaultPriceSubType);
      setItemInvoicePaymentMethod(defaultInvoicePaymentMethod);
    }
    onOpenChange(isOpen);
  };

  const handleQuantityInput = (value: string) => {
    if (offerApplied) setOfferApplied(false);
    setQuantity(Math.max(1, parseInt(value) || 1));
  };

  if (!product) return null;

  const giftBoxes = product.pieces_per_box > 0 ? Math.floor(giftPieces / product.pieces_per_box) : 0;
  const giftRemainingPieces = product.pieces_per_box > 0 ? giftPieces % product.pieces_per_box : 0;
  const baseQuantity = offerApplied ? quantity - giftBoxes : quantity;
  const basePieces = isUnitSale ? quantity : baseQuantity * product.pieces_per_box;
  const totalPieces = isUnitSale ? quantity : (quantity * product.pieces_per_box + (offerApplied ? 0 : giftPieces));
  const displayPrice = isUnitSale ? unitPiecePrice : unitPrice;
  const displayTotal = isUnitSale ? (unitPiecePrice * quantity) : (unitPrice * baseQuantity);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col overflow-hidden p-0" dir={dir}>
        <div className="px-6 pt-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {t('orders.add_product')}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          <div className="space-y-4 py-2">
            {/* Product Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-center space-y-2">
              {product.image_url && (
                <img src={product.image_url} alt={product.name} className="w-16 h-16 rounded-lg object-cover mx-auto" />
              )}
              <h3 className="font-extrabold text-xl text-primary tracking-wide">{product.name}</h3>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {product.pieces_per_box} {t('products.piece_per_box')}
                </Badge>
                {displayPrice > 0 && (
                  <Badge variant="outline" className="text-xs text-primary font-bold">
                    {displayPrice.toLocaleString()} {t('common.currency')}/{isUnitSale ? t('offers.unit_piece') : t('offers.unit_box')}
                  </Badge>
                )}
              </div>

              {product.allow_unit_sale && product.pieces_per_box > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2 border-t border-border mt-2">
                  <Label htmlFor="unit-sale-switch" className="text-sm cursor-pointer">
                    {t('offers.unit_box')}
                  </Label>
                  <Switch
                    id="unit-sale-switch"
                    checked={isUnitSale}
                    onCheckedChange={(checked) => {
                      setIsUnitSale(checked);
                      setQuantity(1);
                      setOfferApplied(false);
                      setGiftPieces(0);
                    }}
                  />
                  <Label htmlFor="unit-sale-switch" className="text-sm cursor-pointer">
                    {t('offers.unit_piece')}
                  </Label>
                </div>
              )}
            </div>

            {/* Quantity Selector */}
            <div className="space-y-3">
              <Label className="text-center block">
                {isUnitSale ? t('orders.quantity_pieces') || 'الكمية (قطع)' : t('orders.quantity_boxes')}
              </Label>
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}>
                  <Minus className="w-5 h-5" />
                </Button>
                <Input type="number" min={1} value={quantity} onChange={(e) => handleQuantityInput(e.target.value)} className="w-24 h-14 text-center text-2xl font-bold" />
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={() => handleQuantityChange(1)}>
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Product Detail Summary - always visible */}
            {!isUnitSale && (
              <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border text-sm">
                <div className="flex justify-between items-center px-3 py-2">
                  <span className="text-muted-foreground">{t('orders.quantity_boxes') || 'الكمية'}</span>
                  <span className="font-bold">{offerApplied ? baseQuantity : quantity} {t('offers.unit_box')}</span>
                </div>
                {displayPrice > 0 && (
                  <div className="flex justify-between items-center px-3 py-2">
                    <span className="text-muted-foreground">{t('orders.subtotal') || 'المجموع الفرعي'}</span>
                    <span className="font-bold">{displayTotal.toLocaleString()} {t('common.currency')}</span>
                  </div>
                )}
                {(giftPieces > 0 || offerApplied) && (
                  <>
                    <div className="flex justify-between items-center px-3 py-2 text-green-700 dark:text-green-400">
                      <span className="flex items-center gap-1"><Gift className="w-4 h-4" />{t('common.free') || 'الهدية'}</span>
                      <span className="font-bold">
                        {giftBoxes > 0 ? `${giftBoxes} ${t('offers.unit_box')}` : ''}
                        {giftBoxes > 0 && giftRemainingPieces > 0 ? ' + ' : ''}
                        {giftRemainingPieces > 0 ? `${giftRemainingPieces} ${t('offers.unit_piece')}` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 text-green-700 dark:text-green-400">
                      <span className="text-muted-foreground">{t('orders.subtotal') || 'المجموع الفرعي (الهدية)'}</span>
                      <span className="font-bold">0 {t('common.currency')}</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 font-bold">
                      <span>{t('orders.total_boxes') || 'إجمالي الصناديق'}</span>
                      <span className="text-primary">{quantity} {t('offers.unit_box')}</span>
                    </div>
                  </>
                )}
                {displayPrice > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 bg-primary/5 rounded-b-lg font-extrabold text-base">
                    <span>{t('orders.grand_total') || 'الإجمالي'}</span>
                    <span className="text-primary">{displayTotal.toLocaleString()} {t('common.currency')}</span>
                  </div>
                )}
              </div>
            )}

            {isUnitSale && displayPrice > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border text-sm">
                <div className="flex justify-between items-center px-3 py-2 font-extrabold text-base bg-primary/5 rounded-lg">
                  <span>{t('orders.grand_total') || 'الإجمالي'}</span>
                  <span className="text-primary">{displayTotal.toLocaleString()} {t('common.currency')}</span>
                </div>
              </div>
            )}

            {/* Offer badge */}
            {!isUnitSale && !offerApplied && giftPieces > 0 && (
              <div className="bg-green-100 dark:bg-green-900/30 border border-green-500 rounded-lg p-3">
                <div className="flex items-center justify-center gap-2">
                  <Gift className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-bold text-green-700 dark:text-green-300">
                    +{giftPieces} {t('offers.unit_piece')} {t('common.free')}
                    {(giftBoxes > 0 || giftRemainingPieces > 0) && (
                      <span className="text-green-600 dark:text-green-400 font-normal">
                        {' '}({giftBoxes > 0 ? `${giftBoxes} ${t('offers.unit_box')}` : ''}{giftBoxes > 0 && giftRemainingPieces > 0 ? ' + ' : ''}{giftRemainingPieces > 0 ? `${giftRemainingPieces} ${t('offers.unit_piece')}` : ''})
                      </span>
                    )}
                  </span>
                </div>
                <Button className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white" onClick={handleApplyOffer}>
                  <Gift className="w-4 h-4 ms-2" />
                  {t('offers.apply_offer')} ({giftBoxes > 0 ? `+${giftBoxes} ${t('offers.unit_box')}` : ''}{giftBoxes > 0 && giftRemainingPieces > 0 ? ' + ' : ''}{giftRemainingPieces > 0 ? `+${giftRemainingPieces} ${t('offers.unit_piece')}` : ''})
                </Button>
              </div>
            )}

            {!isUnitSale && offerApplied && (
              <div className="bg-green-600 text-white rounded-lg p-3">
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" />
                  <span className="font-bold">{t('offers.offer_applied_success')}</span>
                </div>
                <p className="text-sm mt-1 text-green-100">
                  {giftBoxes > 0 && <>{t('orders.total')}: {quantity} {t('offers.unit_box')} ({baseQuantity} + {giftBoxes} {t('common.free')})</>}
                  {giftBoxes > 0 && giftRemainingPieces > 0 && <br />}
                  {giftRemainingPieces > 0 && <>+ {giftRemainingPieces} {t('offers.unit_piece')} {t('common.free')}</>}
                  {giftBoxes === 0 && giftRemainingPieces > 0 && <>{giftPieces} {t('offers.unit_piece')} {t('common.free')}</>}
                </p>
              </div>
            )}

            {!isUnitSale && !offerApplied && (
              <ProductOfferBadge productId={product.id} quantity={quantity} piecesPerBox={product.pieces_per_box} onGiftCalculated={handleGiftCalculated} />
            )}

            {/* Per-Item Pricing Override */}
            <Collapsible open={showPricingOverride} onOpenChange={setShowPricingOverride}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground gap-1">
                  <Settings2 className="w-3.5 h-3.5" />
                  {showPricingOverride ? t('orders.hide_pricing_options') || 'إخفاء خيارات التسعير' : t('orders.custom_pricing') || 'تسعير مخصص لهذا المنتج'}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={itemPaymentType === 'with_invoice' ? 'default' : 'outline'}
                      size="sm"
                      className="h-9 flex items-center gap-1 text-xs"
                      onClick={() => setItemPaymentType('with_invoice')}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      {t('orders.with_invoice')}
                    </Button>
                    <Button
                      type="button"
                      variant={itemPaymentType === 'without_invoice' ? 'default' : 'outline'}
                      size="sm"
                      className="h-9 flex items-center gap-1 text-xs"
                      onClick={() => setItemPaymentType('without_invoice')}
                    >
                      <ReceiptText className="w-3.5 h-3.5" />
                      {t('orders.without_invoice')}
                    </Button>
                  </div>

                  {itemPaymentType === 'without_invoice' && (
                    <div className="grid grid-cols-3 gap-1">
                      {(['super_gros', 'gros', 'retail'] as PriceSubType[]).map((pst) => (
                        <Button
                          key={pst}
                          type="button"
                          variant={itemPriceSubType === pst ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 text-[10px]"
                          onClick={() => setItemPriceSubType(pst)}
                        >
                          {pst === 'super_gros' ? t('products.price_super_gros') : pst === 'gros' ? t('products.price_gros') : t('products.price_retail')}
                        </Button>
                      ))}
                    </div>
                  )}

                  {itemPaymentType === 'with_invoice' && (
                    <InvoicePaymentMethodSelect
                      value={itemInvoicePaymentMethod}
                      onChange={setItemInvoicePaymentMethod}
                    />
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-6 py-3 flex flex-row gap-2">
          <Button className="flex-1" onClick={handleConfirm} disabled={hasUnappliedOffer}>
            <Plus className="w-4 h-4 ms-2" />
            {hasUnappliedOffer ? (t('offers.must_apply_offer') || 'يجب تفعيل العرض أولاً') : t('orders.add_to_order')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductQuantityDialog;
