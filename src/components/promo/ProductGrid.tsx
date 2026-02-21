import React from 'react';
import { Package } from 'lucide-react';
import { Product } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface ProductGridProps {
  products: Product[];
  onProductSelect: (product: Product) => void;
  isLoading?: boolean;
}

const ProductGrid: React.FC<ProductGridProps> = ({ products, onProductSelect, isLoading }) => {
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">{t('products.no_products')}</p>
        <p className="text-sm">{t('products.no_products_desc')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {products.map((product, index) => (
        <button
          key={product.id}
          onClick={() => onProductSelect(product)}
          className={cn(
            'product-btn h-24 flex flex-col items-center justify-center gap-2',
            'animate-in fade-in slide-in-from-bottom-2',
          )}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <Package className="w-8 h-8" />
          <span className="text-center line-clamp-2">{product.name}</span>
        </button>
      ))}
    </div>
  );
};

export default ProductGrid;
