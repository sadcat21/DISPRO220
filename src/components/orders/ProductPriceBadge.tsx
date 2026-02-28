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
    <div className="flex flex-col items-end gap-1">
      <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-primary font-bold border-primary/30">
        {boxPrice.toLocaleString()} {t('common.currency')}
      </Badge>
      {unitPrice !== null && unitPrice > 0 && (
        <span className="text-[10px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded">
          {unitPrice.toLocaleString()} {t('common.currency')}/{unitLabel}
        </span>
      )}
    </div>
  );
};

export default ProductPriceBadge;
