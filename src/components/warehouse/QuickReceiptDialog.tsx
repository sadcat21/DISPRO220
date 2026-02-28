import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Camera, Trash2, Package } from 'lucide-react';
import SimpleProductPickerDialog from '@/components/stock/SimpleProductPickerDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';

interface ReceiptItem {
  product_id: string;
  quantity: number;
}

interface QuickReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  branchId: string | undefined;
  createReceipt: (
    data: { invoice_number?: string; notes?: string; invoice_photo_url?: string },
    items: { product_id: string; quantity: number }[]
  ) => Promise<any>;
}

const QuickReceiptDialog: React.FC<QuickReceiptDialogProps> = ({
  open, onOpenChange, products, branchId, createReceipt
}) => {
  const { t } = useLanguage();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([{ product_id: '', quantity: 1 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [invoicePhoto, setInvoicePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInvoicePhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', quantity: 1 }]);

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const resetForm = () => {
    setInvoiceNumber('');
    setNotes('');
    setItems([{ product_id: '', quantity: 1 }]);
    setInvoicePhoto(null);
    setPhotoPreview(null);
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error(t('stock.add_products'));
      return;
    }
    if (!branchId) {
      toast.error(t('branches.select_branch'));
      return;
    }

    setIsSaving(true);
    try {
      let photoUrl: string | undefined;
      if (invoicePhoto) {
        const ext = invoicePhoto.name.split('.').pop();
        const fileName = `invoice_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, invoicePhoto);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }

      await createReceipt({ invoice_number: invoiceNumber, notes, invoice_photo_url: photoUrl }, validItems);
      toast.success(t('stock.receipt_saved'));
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{t('stock.new_receipt')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('stock.invoice_number')} ({t('common.optional')})</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder={t('stock.invoice_number')} className="text-right" />
            </div>

            <div className="space-y-2">
              <Label>{t('stock.invoice_photo')}</Label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                <Camera className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t('stock.take_photo')}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
              </label>
              {photoPreview && <img src={photoPreview} alt="Invoice" className="w-full h-32 object-cover rounded-lg" />}
            </div>

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

            <div className="space-y-2">
              <Label>{t('common.notes')} ({t('common.optional')})</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('common.notes')} className="text-right" />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              {t('stock.save_receipt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SimpleProductPickerDialog
        open={productPickerIndex !== null}
        onOpenChange={(o) => { if (!o) setProductPickerIndex(null); }}
        products={products.map(p => ({ id: p.id, name: p.name }))}
        selectedProductId={productPickerIndex !== null ? items[productPickerIndex]?.product_id || '' : ''}
        onSelect={(productId) => {
          if (productPickerIndex !== null) updateItem(productPickerIndex, 'product_id', productId);
        }}
      />
    </>
  );
};

export default QuickReceiptDialog;
