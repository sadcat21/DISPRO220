import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Printer } from 'lucide-react';

export type GiftPrintColumnKey =
  | 'number' | 'customerName' | 'customerNameFr' | 'storeName'
  | 'sector' | 'address' | 'wilaya' | 'phone'
  | 'productName' | 'venteQuantity' | 'giftQuantity' | 'giftBoxPiece'
  | 'workerName' | 'date';

export interface GiftPrintColumn {
  key: GiftPrintColumnKey;
  label: string;
  defaultVisible: boolean;
}

export const ALL_PRINT_COLUMNS: GiftPrintColumn[] = [
  { key: 'number', label: 'N° / الرقم', defaultVisible: true },
  { key: 'customerName', label: 'Nom / الاسم', defaultVisible: true },
  { key: 'customerNameFr', label: 'Nom FR / الاسم بالفرنسية', defaultVisible: false },
  { key: 'storeName', label: 'Magasin / اسم المحل', defaultVisible: false },
  { key: 'sector', label: 'Secteur / السيكتور', defaultVisible: false },
  { key: 'address', label: 'Adresse / العنوان', defaultVisible: true },
  { key: 'wilaya', label: 'Wilaya / الولاية', defaultVisible: true },
  { key: 'phone', label: 'Téléphone / الهاتف', defaultVisible: true },
  { key: 'productName', label: 'Produit / المنتج', defaultVisible: true },
  { key: 'venteQuantity', label: 'Ventes / المبيعات', defaultVisible: true },
  { key: 'giftQuantity', label: 'Gratuit (pièces) / الهدايا قطع', defaultVisible: false },
  { key: 'giftBoxPiece', label: 'Gratuit (Box.Pcs) / الهدايا صندوق.قطع', defaultVisible: true },
  { key: 'workerName', label: 'Employé / العامل', defaultVisible: true },
  { key: 'date', label: 'Date / التاريخ', defaultVisible: true },
];

export interface GiftPrintSettings {
  columns: GiftPrintColumnKey[];
  productFilter: string; // 'all' or product id
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: { id: string; name: string }[];
  onPrint: (settings: GiftPrintSettings) => void;
}

const STORAGE_KEY = 'gifts-print-columns';

const getDefaultColumns = (): GiftPrintColumnKey[] =>
  ALL_PRINT_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

const loadSavedColumns = (): GiftPrintColumnKey[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return getDefaultColumns();
};

const GiftsPrintSettingsDialog: React.FC<Props> = ({ open, onOpenChange, products, onPrint }) => {
  const [selectedColumns, setSelectedColumns] = useState<GiftPrintColumnKey[]>(loadSavedColumns);
  const [productFilter, setProductFilter] = useState('all');

  const toggleColumn = (key: GiftPrintColumnKey) => {
    setSelectedColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const uniqueProducts = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => map.set(p.id, p.name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  const handlePrint = () => {
    onPrint({ columns: selectedColumns, productFilter });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4" />
            إعدادات طباعة A4
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-1">
          {/* Product filter */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">تصفية حسب المنتج</Label>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المنتجات</SelectItem>
                {uniqueProducts.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Column selection */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">الأعمدة المعروضة</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {ALL_PRINT_COLUMNS.map(col => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer text-xs"
                >
                  <Checkbox
                    checked={selectedColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handlePrint} disabled={selectedColumns.length === 0}>
            <Printer className="w-3.5 h-3.5" />
            طباعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GiftsPrintSettingsDialog;
