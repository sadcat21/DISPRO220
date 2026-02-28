import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Package } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface SimpleProductOption {
  id: string;
  name: string;
  image_url?: string | null;
}

interface SimpleProductPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SimpleProductOption[];
  selectedProductId: string;
  onSelect: (productId: string) => void;
}

const SimpleProductPickerDialog: React.FC<SimpleProductPickerDialogProps> = ({
  open,
  onOpenChange,
  products,
  selectedProductId,
  onSelect,
}) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(''); }}>
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
            onChange={e => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => {
              const isSelected = p.id === selectedProductId;
              return (
                <button
                  key={p.id}
                  className={`flex flex-col rounded-2xl overflow-hidden text-center transition-all relative bg-white shadow-lg border-2
                    ${isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-red-200 hover:border-primary/60 hover:shadow-xl'}
                  `}
                  onClick={() => {
                    onSelect(p.id);
                    onOpenChange(false);
                    setSearch('');
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
                    <div className="w-full aspect-square bg-red-50 flex items-center justify-center">
                      <Package className="w-10 h-10 text-primary/40" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              {t('common.no_results')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SimpleProductPickerDialog;
