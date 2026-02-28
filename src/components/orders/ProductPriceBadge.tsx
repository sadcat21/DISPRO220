import React from 'react';
import { Package, Boxes, Gift } from 'lucide-react';
import { Product } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';

interface ProductPriceBadgeProps {
  product: Product;
  boxPrice: number;
  /** Total boxes in cart (including gifts) */
  totalQuantity?: number;
  /** Gift boxes count */
  giftBoxes?: number;
  /** Gift pieces count */
  giftPieces?: number;
}

/**
 * Displays product price with unit pricing info.
 * Shows box price, per-unit price, and "after offer" effective price.
 */
const ProductPriceBadge: React.FC<ProductPriceBadgeProps> = ({ product, boxPrice, totalQuantity = 0, giftBoxes = 0, giftPieces = 0 }) => {
  const { t } = useLanguage();

  if (boxPrice <= 0) return null;

  const pricingUnit = product.pricing_unit || 'box';

  // Calculate unit price from box price
  let unitPrice: number | null = null;
  let unitLabel = '';

  if (pricingUnit === 'kg' && product.weight_per_box && product.weight_per_box > 0) {
    unitPrice = boxPrice / product.weight_per_box;
    unitLabel = t('products.pricing_unit_kg');
  } else if (pricingUnit === 'unit' && product.pieces_per_box > 1) {
    unitPrice = boxPrice / product.pieces_per_box;
    unitLabel = t('products.pricing_unit_unit');
  }

  // Calculate "after offer" price
  // Formula: (paidBoxes * boxPrice) / totalBoxes = effective box price
  // Then derive unit price from effective box price
  let afterOfferUnitPrice: number | null = null;
  const hasGift = totalQuantity > 0 && (giftBoxes > 0 || giftPieces > 0);

  if (hasGift) {
    const paidBoxes = totalQuantity - giftBoxes;
    const totalPaid = paidBoxes * boxPrice;
    // Effective box price after offer
    const effectiveBoxPrice = totalPaid / totalQuantity;

    if (pricingUnit === 'kg' && product.weight_per_box && product.weight_per_box > 0) {
      afterOfferUnitPrice = effectiveBoxPrice / product.weight_per_box;
    } else if (pricingUnit === 'unit' && product.pieces_per_box > 1) {
      afterOfferUnitPrice = effectiveBoxPrice / product.pieces_per_box;
    } else {
      // Box pricing: show effective box price
      afterOfferUnitPrice = effectiveBoxPrice;
    }
  }

  // Units per box for the pricing unit badge (blue circle reference)
  const unitsPerBox = pricingUnit === 'kg' && product.weight_per_box && product.weight_per_box > 0
    ? product.weight_per_box
    : pricingUnit === 'unit' && product.pieces_per_box > 1
      ? product.pieces_per_box
      : null;

  return (
    <div className="flex flex-col w-full gap-1">
      {/* Box price with pieces badge */}
      <div className="relative w-full rounded-md bg-primary/10 border border-primary/30 py-1 text-center">
        <span className="text-base font-bold text-primary flex items-center justify-center gap-1">
          <Package className="w-4 h-4" />
          {boxPrice.toLocaleString()} {t('common.currency')}
        </span>
        {product.pieces_per_box > 0 && (
          <span
            dir="ltr"
            className="absolute start-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold gap-0.5 whitespace-nowrap"
          >
            {product.pieces_per_box} <span>pcs</span>
          </span>
        )}
      </div>

      {/* Unit price with inside badge for units per box */}
      {unitPrice !== null && unitPrice > 0 && (
        <div className="relative w-full rounded-md bg-muted border border-border py-1 text-center">
          <span className="text-sm font-semibold text-foreground flex items-center justify-center gap-1">
            <Boxes className="w-3.5 h-3.5" />
            {unitPrice.toLocaleString()} {t('common.currency')}/{unitLabel}
          </span>
          {unitsPerBox !== null && (
            <span
              dir="ltr"
              className="absolute start-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold gap-0.5 whitespace-nowrap"
            >
              {Number.isInteger(unitsPerBox) ? unitsPerBox : unitsPerBox.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span>{pricingUnit === 'kg' ? 'Kg' : 'pcs'}</span>
            </span>
          )}
        </div>
      )}

      {/* After offer price */}
      {afterOfferUnitPrice !== null && afterOfferUnitPrice > 0 && unitLabel && (
        <div className="w-full rounded-md bg-accent border border-accent/50 py-1 text-center">
          <span className="text-sm font-bold text-accent-foreground flex items-center justify-center gap-1">
            <Gift className="w-3.5 h-3.5" />
            {afterOfferUnitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t('common.currency')}/{unitLabel || t('products.box')}
          </span>
        </div>
      )}

    </div>
  );
};

export default ProductPriceBadge;
