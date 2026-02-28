import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Product } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';

interface ProductPriceBadgeProps {
  product: Product;
  boxPrice: number; // The calculated box price
}

/**
 * Displays product price with unit pricing info.
 * Shows box price AND per-unit price (per kg / per unit) when applicable.
 */
const ProductPriceBadge: React.FC<ProductPriceBadgeProps> = ({ product, boxPrice }) => {
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

  return (
    <div className="flex flex-col items-center w-full gap-0.5">
      <span className="text-xs font-bold text-primary">
        {boxPrice.toLocaleString()} {t('common.currency')}
      </span>
      {unitPrice !== null && unitPrice > 0 && (
        <span className="text-[11px] font-semibold text-muted-foreground">
          {unitPrice.toLocaleString()} {t('common.currency')}/{unitLabel}
        </span>
      )}
    </div>
  );
};

export default ProductPriceBadge;
