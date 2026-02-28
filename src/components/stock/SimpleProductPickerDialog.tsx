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
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors
                    ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}
                  `}
                  onClick={() => {
                    onSelect(p.id);
                    onOpenChange(false);
                    setSearch('');
                  }}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded-full object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                      <Package className={`w-7 h-7 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
                    </div>
                  )}
                  <span className="font-semibold text-sm leading-tight truncate w-full">{p.name}</span>
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
