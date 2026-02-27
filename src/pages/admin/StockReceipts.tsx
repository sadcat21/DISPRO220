import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Camera, Trash2, ClipboardList, Image as ImageIcon, Package } from 'lucide-react';
import SimpleProductPickerDialog from '@/components/stock/SimpleProductPickerDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { formatDate } from '@/utils/formatters';

interface ReceiptItem {
  product_id: string;
  quantity: number;
}

const StockReceipts: React.FC = () => {
  const { t, language } = useLanguage();
  const { activeBranch } = useAuth();
  const { receipts, products, createReceipt, isLoading, branchId } = useWarehouseStock();

  const [showDialog, setShowDialog] = useState(false);
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

  const addItem = () => {
    setItems(prev => [...prev, { product_id: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
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
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, invoicePhoto);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);
        
        photoUrl = urlData.publicUrl;
      }

      await createReceipt(
        { invoice_number: invoiceNumber, notes, invoice_photo_url: photoUrl },
        validItems
      );

      toast.success(t('stock.receipt_saved'));
      setShowDialog(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving receipt:', error);
      toast.error(error.message || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setInvoiceNumber('');
    setNotes('');
    setItems([{ product_id: '', quantity: 1 }]);
    setInvoicePhoto(null);
    setPhotoPreview(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          {t('stock.receipts')}
        </h2>
        <Button size="sm" onClick={() => setShowDialog(true)} disabled={!branchId}>
          <Plus className="w-4 h-4 ml-1" />
          {t('stock.new_receipt')}
        </Button>
      </div>

      {!branchId && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            {t('branches.select_branch')}
          </CardContent>
        </Card>
      )}

      {branchId && receipts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('stock.no_receipts')}
          </CardContent>
        </Card>
      )}

      {receipts.map(receipt => (
        <Card key={receipt.id}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">
                {receipt.invoice_number ? `${t('stock.invoice_number')}: ${receipt.invoice_number}` : t('stock.receipt_details')}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(receipt.created_at, 'dd/MM/yyyy HH:mm', language)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{receipt.total_items} {t('stock.items')}</span>
              {receipt.invoice_photo_url && (
                <a href={receipt.invoice_photo_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  {t('stock.view_invoice')}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Create Receipt Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{t('stock.new_receipt')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('stock.invoice_number')} ({t('common.optional')})</Label>
              <Input
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder={t('stock.invoice_number')}
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('stock.invoice_photo')}</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('stock.take_photo')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
                {photoPreview && (
                  <img src={photoPreview} alt="Invoice" className="w-full h-40 object-cover rounded-lg" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('stock.add_products')}</Label>
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent transition-colors"
                      onClick={() => setProductPickerIndex(index)}
                    >
                      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className={item.product_id ? 'text-foreground truncate' : 'text-muted-foreground'}>
                        {item.product_id ? products.find(p => p.id === item.product_id)?.name || t('stock.product') : t('stock.product')}
                      </span>
                    </button>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="text-center"
                    />
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
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('common.notes')}
                className="text-right"
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              {t('stock.save_receipt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SimpleProductPickerDialog
        open={productPickerIndex !== null}
        onOpenChange={(open) => { if (!open) setProductPickerIndex(null); }}
        products={products.map(p => ({ id: p.id, name: p.name }))}
        selectedProductId={productPickerIndex !== null ? items[productPickerIndex]?.product_id || '' : ''}
        onSelect={(productId) => {
          if (productPickerIndex !== null) {
            updateItem(productPickerIndex, 'product_id', productId);
          }
        }}
      />
    </div>
  );
};

export default StockReceipts;
