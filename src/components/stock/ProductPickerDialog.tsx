import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Package, Layers } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ProductOption {
  id: string;
  name: string;
  warehouseQty: number;
  groupName?: string;
  image_url?: string | null;
}

interface ProductPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  selectedProductIds: string[];
  onSelect: (productId: string) => void;
}

const ProductPickerDialog: React.FC<ProductPickerDialogProps> = ({
  open,
  onOpenChange,
  products,
  selectedProductIds,
  onSelect,
}) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group products by groupName
  const groups = useMemo(() => {
    const map = new Map<string, ProductOption[]>();
    const ungrouped: ProductOption[] = [];
    for (const p of filtered) {
      if (p.groupName) {
        if (!map.has(p.groupName)) map.set(p.groupName, []);
        map.get(p.groupName)!.push(p);
      } else {
        ungrouped.push(p);
      }
    }
    const result: { name: string; products: ProductOption[] }[] = [];
    for (const [name, prods] of map) {
      result.push({ name, products: prods });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    if (ungrouped.length > 0) {
      result.push({ name: '__ungrouped__', products: ungrouped });
    }
    return result;
  }, [filtered]);

  const allGroupNames = groups.map(g => g.name);

  const visibleProducts = activeGroup
    ? groups.find(g => g.name === activeGroup)?.products || []
    : filtered;

  /** Format quantity for display: boxes.pieces format */
  const fmtQty = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  const renderProductButton = (p: ProductOption) => {
    const isSelected = selectedProductIds.includes(p.id);
    const isOutOfStock = p.warehouseQty === 0;
    return (
      <button
        key={p.id}
        disabled={isSelected}
        className={`flex flex-col rounded-2xl overflow-hidden text-center transition-all relative bg-white shadow-lg border-2
          ${isSelected ? 'border-primary ring-2 ring-primary/40 opacity-60 cursor-not-allowed' : 'border-red-200 hover:border-primary/60 hover:shadow-xl cursor-pointer'}
          ${isOutOfStock && !isSelected ? 'border-orange-400/60' : ''}
        `}
        onClick={() => {
          if (!isSelected) {
            onSelect(p.id);
            onOpenChange(false);
            setSearch('');
            setActiveGroup(null);
          }
        }}
      >
        {/* اسم المنتج أعلى الصورة */}
        <div className={`px-2 py-2 border-b ${isSelected ? 'bg-primary border-primary' : 'bg-red-50 border-red-100'}`}>
          <span className={`font-bold leading-tight block text-center truncate text-sm ${isSelected ? 'text-white' : 'text-red-900'}`}>
            {p.name}
          </span>
        </div>
        {/* الصورة */}
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-full aspect-square object-cover" loading="lazy" />
        ) : (
          <div className={`w-full aspect-square flex items-center justify-center ${isOutOfStock ? 'bg-destructive/10' : 'bg-red-50'}`}>
            <Package className={`w-10 h-10 ${isOutOfStock ? 'text-destructive' : 'text-primary/40'}`} />
          </div>
        )}
        <Badge variant={isOutOfStock ? 'destructive' : isSelected ? 'outline' : 'secondary'} className="text-[10px] px-1.5 py-0.5 m-1">
          {isSelected ? '✓' : fmtQty(p.warehouseQty)}
        </Badge>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setActiveGroup(null); setSearch(''); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {t('stock.product')}
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveGroup(null); }}
            className="ps-9"
          />
        </div>

        {/* Group tabs */}
        {!search && groups.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${!activeGroup ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-accent'}`}
              onClick={() => setActiveGroup(null)}
            >
              الكل
            </button>
            {allGroupNames.map(name => (
              <button
                key={name}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1
                  ${activeGroup === name ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-accent'}`}
                onClick={() => setActiveGroup(name === activeGroup ? null : name)}
              >
                <Layers className="w-3 h-3" />
                {name === '__ungrouped__' ? 'أخرى' : name}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto space-y-3">
          {activeGroup || search ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {visibleProducts.map(renderProductButton)}
              </div>
              {visibleProducts.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">
                  {t('common.no_results')}
                </div>
              )}
            </>
          ) : (
            groups.map(group => (
              <div key={group.name}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold text-muted-foreground">
                    {group.name === '__ungrouped__' ? 'أخرى' : group.name}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{group.products.length}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {group.products.map(renderProductButton)}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductPickerDialog;
