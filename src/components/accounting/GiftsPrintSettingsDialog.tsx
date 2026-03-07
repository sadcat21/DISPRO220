import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Printer, Save, Loader2, GripVertical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type GiftPrintColumnKey =
  | 'number' | 'customerName' | 'customerNameFr' | 'storeName' | 'storeNameFr'
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
  { key: 'customerName', label: 'Nom AR / الاسم بالعربية', defaultVisible: false },
  { key: 'customerNameFr', label: 'Nom FR / الاسم بالفرنسية', defaultVisible: true },
  { key: 'storeName', label: 'Magasin AR / اسم المحل بالعربية', defaultVisible: false },
  { key: 'storeNameFr', label: 'Magasin FR / اسم المحل بالفرنسية', defaultVisible: false },
  { key: 'phone', label: 'Téléphone / الهاتف', defaultVisible: true },
  { key: 'sector', label: 'Secteur / السيكتور', defaultVisible: true },
  { key: 'address', label: 'Adresse / العنوان', defaultVisible: false },
  { key: 'wilaya', label: 'Wilaya / الولاية', defaultVisible: false },
  { key: 'productName', label: 'Produit / المنتج', defaultVisible: true },
  { key: 'venteQuantity', label: 'Ventes / المبيعات', defaultVisible: true },
  { key: 'giftQuantity', label: 'Gratuit (pièces) / الهدايا قطع', defaultVisible: false },
  { key: 'giftBoxPiece', label: 'Gratuit (Box.Pcs) / الهدايا صندوق.قطع', defaultVisible: true },
  { key: 'workerName', label: 'Employé / العامل', defaultVisible: true },
  { key: 'date', label: 'Date / التاريخ', defaultVisible: true },
];

const COLUMN_LABELS: Record<GiftPrintColumnKey, string> = Object.fromEntries(
  ALL_PRINT_COLUMNS.map(c => [c.key, c.label])
) as Record<GiftPrintColumnKey, string>;

export interface GiftPrintSettings {
  columns: GiftPrintColumnKey[];
  productFilter: string;
  separateByProduct: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: { id: string; name: string }[];
  onPrint: (settings: GiftPrintSettings) => void;
  isAdmin?: boolean;
}

const STORAGE_KEY = 'gifts-print-columns';
const SEPARATE_KEY = 'gifts-print-separate';
const DB_SETTINGS_KEY = 'gifts_print_settings';

const getDefaultColumns = (): GiftPrintColumnKey[] =>
  ALL_PRINT_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

const getDefaultOrder = (): GiftPrintColumnKey[] =>
  ALL_PRINT_COLUMNS.map(c => c.key);

const GiftsPrintSettingsDialog: React.FC<Props> = ({ open, onOpenChange, products, onPrint, isAdmin = false }) => {
  const [selectedColumns, setSelectedColumns] = useState<GiftPrintColumnKey[]>(getDefaultColumns);
  const [columnOrder, setColumnOrder] = useState<GiftPrintColumnKey[]>(getDefaultOrder);
  const [productFilter, setProductFilter] = useState('all');
  const [separateByProduct, setSeparateByProduct] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Load settings from DB first, then fallback to localStorage
  useEffect(() => {
    if (!open || loaded) return;
    const loadSettings = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', DB_SETTINGS_KEY)
          .maybeSingle();
        
        if (data?.value) {
          const parsed = JSON.parse(data.value);
          if (parsed.columns?.length) setSelectedColumns(parsed.columns);
          if (parsed.columnOrder?.length) setColumnOrder(parsed.columnOrder);
          if (typeof parsed.separateByProduct === 'boolean') setSeparateByProduct(parsed.separateByProduct);
          setLoaded(true);
          return;
        }
      } catch {}

      // Fallback to localStorage
      try {
        const savedCols = localStorage.getItem(STORAGE_KEY);
        if (savedCols) setSelectedColumns(JSON.parse(savedCols));
        const savedSep = localStorage.getItem(SEPARATE_KEY);
        if (savedSep !== null) setSeparateByProduct(JSON.parse(savedSep));
      } catch {}
      setLoaded(true);
    };
    loadSettings();
  }, [open, loaded]);

  useEffect(() => {
    if (!open) setLoaded(false);
  }, [open]);

  const toggleColumn = (key: GiftPrintColumnKey) => {
    setSelectedColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSeparateChange = (val: boolean) => {
    setSeparateByProduct(val);
    localStorage.setItem(SEPARATE_KEY, JSON.stringify(val));
  };

  const uniqueProducts = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => map.set(p.id, p.name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  // The final ordered columns for printing = columnOrder filtered to selected only
  const orderedSelectedColumns = useMemo(() => {
    return columnOrder.filter(k => selectedColumns.includes(k));
  }, [columnOrder, selectedColumns]);

  const handlePrint = () => {
    onPrint({ columns: orderedSelectedColumns, productFilter, separateByProduct });
    onOpenChange(false);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    setColumnOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleSaveToDb = async () => {
    setIsSaving(true);
    try {
      const settingsValue = JSON.stringify({
        columns: selectedColumns,
        columnOrder,
        separateByProduct,
      });

      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', DB_SETTINGS_KEY)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('app_settings')
          .update({ value: settingsValue, updated_at: new Date().toISOString() })
          .eq('key', DB_SETTINGS_KEY);
      } else {
        await supabase
          .from('app_settings')
          .insert({ key: DB_SETTINGS_KEY, value: settingsValue });
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedColumns));
      localStorage.setItem(SEPARATE_KEY, JSON.stringify(separateByProduct));
      toast.success('تم حفظ إعدادات الطباعة الافتراضية');
    } catch (err: any) {
      toast.error('فشل الحفظ: ' + (err.message || ''));
    } finally {
      setIsSaving(false);
    }
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
          {/* Separate by product */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-accent/30">
            <Label htmlFor="separate-product" className="text-xs cursor-pointer">
              صفحة مستقلة لكل منتج
            </Label>
            <Switch
              id="separate-product"
              checked={separateByProduct}
              onCheckedChange={handleSeparateChange}
            />
          </div>

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

          {/* Column selection + reorder */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">الأعمدة (اسحب لإعادة الترتيب)</Label>
            <div className="grid grid-cols-1 gap-0.5">
              {columnOrder.map((key, idx) => {
                const isSelected = selectedColumns.includes(key);
                const isDragging = dragIdx === idx;
                const isOver = overIdx === idx;
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-grab text-xs transition-colors
                      ${isDragging ? 'opacity-40' : ''}
                      ${isOver && !isDragging ? 'bg-primary/10 border border-dashed border-primary/40' : 'hover:bg-accent/50'}
                    `}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleColumn(key)}
                    />
                    <span className={isSelected ? 'font-medium' : 'text-muted-foreground'}>
                      {COLUMN_LABELS[key] || key}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          {isAdmin && (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={handleSaveToDb} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              حفظ كافتراضي
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handlePrint} disabled={orderedSelectedColumns.length === 0}>
            <Printer className="w-3.5 h-3.5" />
            طباعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GiftsPrintSettingsDialog;
