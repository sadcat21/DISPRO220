import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Trash2, Package, User } from 'lucide-react';
import SimpleProductPickerDialog from '@/components/stock/SimpleProductPickerDialog';
import WorkerPickerDialog from '@/components/stock/WorkerPickerDialog';
import { toast } from 'sonner';
import { Product } from '@/types/database';
import { WarehouseStockItem } from '@/hooks/useWarehouseStock';

interface LoadItem {
  product_id: string;
  quantity: number;
}

interface QuickLoadWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  workers: { id: string; full_name: string; username: string }[];
  warehouseStock: WarehouseStockItem[];
  loadToWorker: (
    targetWorkerId: string,
    items: { product_id: string; quantity: number; notes?: string }[]
  ) => Promise<void>;
}

const QuickLoadWorkerDialog: React.FC<QuickLoadWorkerDialogProps> = ({
  open, onOpenChange, products, workers, warehouseStock, loadToWorker
}) => {
  const { t } = useLanguage();
  const [selectedWorker, setSelectedWorker] = useState('');
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [items, setItems] = useState<LoadItem[]>([{ product_id: '', quantity: 1 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);

  const addItem = () => setItems(prev => [...prev, { product_id: '', quantity: 1 }]);

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LoadItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const resetForm = () => {
    setSelectedWorker('');
    setItems([{ product_id: '', quantity: 1 }]);
  };

  const selectedWorkerName = workers.find(w => w.id === selectedWorker)?.full_name;

  const handleSave = async () => {
    if (!selectedWorker) {
      toast.error('اختر العامل أولاً');
      return;
    }
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error(t('stock.add_products'));
      return;
    }

    setIsSaving(true);
    try {
      await loadToWorker(selectedWorker, validItems.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        notes: 'شحن سريع من مخزون الفرع',
      })));
      toast.success('تم شحن العامل بنجاح');
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Available products with warehouse quantity
  const availableProducts = products.map(p => {
    const ws = warehouseStock.find(s => s.product_id === p.id);
    return { id: p.id, name: `${p.name} (${ws?.quantity || 0})` };
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>شحن عامل</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Worker selection */}
            <div className="space-y-2">
              <Label>العامل</Label>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
                onClick={() => setShowWorkerPicker(true)}
              >
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={selectedWorker ? 'text-foreground' : 'text-muted-foreground'}>
                  {selectedWorkerName || 'اختر العامل'}
                </span>
              </button>
            </div>

            {/* Products */}
            <div className="space-y-2">
              <Label>{t('stock.add_products')}</Label>
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onClick={() => setProductPickerIndex(index)}
                    >
                      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className={item.product_id ? 'text-foreground truncate' : 'text-muted-foreground'}>
                        {item.product_id ? products.find(p => p.id === item.product_id)?.name || t('stock.product') : t('stock.product')}
                      </span>
                    </button>
                  </div>
                  <div className="w-24">
                    <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="text-center" />
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addItem} className="w-full">
                <Plus className="w-4 h-4 ml-1" />
                {t('stock.add_products')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              شحن العامل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkerPickerDialog
        open={showWorkerPicker}
        onOpenChange={setShowWorkerPicker}
        workers={workers.map(w => ({ id: w.id, full_name: w.full_name, username: w.username }))}
        selectedWorkerId={selectedWorker}
        onSelect={setSelectedWorker}
      />

      <SimpleProductPickerDialog
        open={productPickerIndex !== null}
        onOpenChange={(o) => { if (!o) setProductPickerIndex(null); }}
        products={availableProducts}
        selectedProductId={productPickerIndex !== null ? items[productPickerIndex]?.product_id || '' : ''}
        onSelect={(productId) => {
          if (productPickerIndex !== null) updateItem(productPickerIndex, 'product_id', productId);
        }}
      />
    </>
  );
};

export default QuickLoadWorkerDialog;
