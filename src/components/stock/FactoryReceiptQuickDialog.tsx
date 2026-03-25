import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, Trash2, Loader2, ArrowDownToLine, Camera, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/utils';
import SimpleProductPickerDialog from './SimpleProductPickerDialog';
import { formatDate } from '@/utils/formatters';

interface ReceiptItem {
  product_id: string;
  quantity: number;
}

interface PendingReceipt {
  id: string;
  invoice_number: string | null;
  notes: string | null;
  total_items: number | null;
  created_at: string;
  status: string;
  created_by: string;
  creator_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FactoryReceiptQuickDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { workerId, role, activeRole, activeBranch } = useAuth();
  const [items, setItems] = useState<ReceiptItem[]>([{ product_id: '', quantity: 1 }]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; image_url?: string | null }[]>([]);
  const [invoicePhoto, setInvoicePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [palletCount, setPalletCount] = useState(0);
  const [tab, setTab] = useState<'create' | 'pending'>('create');
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<{ product_name: string; quantity: number; image_url?: string | null }[]>([]);
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const isWarehouseManager = activeRole?.custom_role_code === 'warehouse_manager';
  const isAdmin = isAdminRole(role);

  useEffect(() => {
    if (!open) return;
    // Resolve branch
    if (activeBranch?.id) {
      setBranchId(activeBranch.id);
    } else if (workerId) {
      supabase.from('workers').select('branch_id').eq('id', workerId).maybeSingle()
        .then(({ data }) => setBranchId(data?.branch_id || null));
    }
  }, [open, activeBranch?.id, workerId]);

  useEffect(() => {
    if (!open || !branchId) return;
    supabase.from('products').select('id, name, image_url').eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data || []));
    fetchPendingReceipts();
  }, [open, branchId]);

  const fetchPendingReceipts = async () => {
    if (!branchId) return;
    setIsLoadingPending(true);
    const { data } = await supabase
      .from('stock_receipts')
      .select('id, invoice_number, notes, total_items, created_at, status, created_by')
      .eq('branch_id', branchId)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    
    // Get creator names
    const receipts = data || [];
    if (receipts.length > 0) {
      const creatorIds = [...new Set(receipts.map(r => r.created_by))];
      const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', creatorIds);
      const workerMap = new Map((workers || []).map(w => [w.id, w.full_name]));
      receipts.forEach(r => { (r as any).creator_name = workerMap.get(r.created_by) || ''; });
    }
    
    setPendingReceipts(receipts as PendingReceipt[]);
    setIsLoadingPending(false);
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', quantity: 1 }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(prev => prev.filter((_, idx) => idx !== i)); };
  const updateItem = (i: number, field: keyof ReceiptItem, value: any) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setInvoicePhoto(file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) { toast.error('أضف منتجات للاستلام'); return; }
    if (!branchId || !workerId) { toast.error('اختر الفرع أولاً'); return; }

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

      const status = isWarehouseManager && !isAdmin ? 'pending_approval' : 'confirmed';

      const { data: receipt, error: receiptError } = await supabase
        .from('stock_receipts')
        .insert({
          branch_id: branchId,
          created_by: workerId,
          invoice_number: invoiceNumber || null,
          invoice_photo_url: photoUrl || null,
          notes: notes || null,
          total_items: validItems.reduce((sum, i) => sum + i.quantity, 0),
          status,
        })
        .select()
        .single();
      if (receiptError) throw receiptError;

      // Fetch pallet settings
      const { data: palletSettings } = await supabase
        .from('pallet_settings')
        .select('product_id, boxes_per_pallet')
        .eq('branch_id', branchId);

      const receiptItems = validItems.map(i => {
        const setting = (palletSettings || []).find(s => s.product_id === i.product_id);
        const palletQty = setting && setting.boxes_per_pallet > 0 ? Math.ceil(i.quantity / setting.boxes_per_pallet) : 0;
        return { receipt_id: receipt.id, product_id: i.product_id, quantity: i.quantity, pallet_quantity: palletQty };
      });
      const { error: itemsError } = await supabase.from('stock_receipt_items').insert(receiptItems);
      if (itemsError) throw itemsError;

      if (status === 'confirmed') {
        // Apply stock changes immediately
        for (const item of validItems) {
          await supabase.from('stock_movements').insert({
            product_id: item.product_id, branch_id: branchId, quantity: item.quantity,
            movement_type: 'receipt', status: 'approved', created_by: workerId,
            receipt_id: receipt.id, notes: `استلام من المصنع - فاتورة: ${invoiceNumber || 'بدون'}`,
          });

          const { data: existing } = await supabase.from('warehouse_stock')
            .select('id, quantity').eq('branch_id', branchId).eq('product_id', item.product_id).maybeSingle();
          if (existing) {
            await supabase.from('warehouse_stock').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id);
          } else {
            await supabase.from('warehouse_stock').insert({ branch_id: branchId, product_id: item.product_id, quantity: item.quantity });
          }
        }

        if (palletCount > 0) {
          const { data: bp } = await supabase.from('branch_pallets').select('id, quantity').eq('branch_id', branchId).maybeSingle();
          if (bp) { await supabase.from('branch_pallets').update({ quantity: bp.quantity + palletCount }).eq('id', bp.id); }
          else { await supabase.from('branch_pallets').insert({ branch_id: branchId, quantity: palletCount }); }
          await supabase.from('pallet_movements').insert({ branch_id: branchId, quantity: palletCount, movement_type: 'receipt', reference_id: receipt.id, notes: `استلام باليطات`, created_by: workerId });
        }
        toast.success('تم تأكيد الاستلام من المصنع');
      } else {
        toast.success('تم إرسال طلب الاستلام للموافقة');
      }

      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async (receiptId: string) => {
    if (!workerId || !branchId) return;
    setProcessingId(receiptId);
    try {
      const { data: receiptData } = await supabase.from('stock_receipts').select('*').eq('id', receiptId).single();
      if (!receiptData || receiptData.status !== 'pending_approval') { toast.error('هذا الوصل تمت معالجته'); return; }

      const { data: rItems } = await supabase.from('stock_receipt_items').select('*').eq('receipt_id', receiptId);

      await supabase.from('stock_receipts').update({ status: 'confirmed', approved_by: workerId, approved_at: new Date().toISOString() }).eq('id', receiptId);

      for (const item of (rItems || [])) {
        await supabase.from('stock_movements').insert({
          product_id: item.product_id, branch_id: receiptData.branch_id, quantity: item.quantity,
          movement_type: 'receipt', status: 'approved', created_by: workerId,
          receipt_id: receiptId, notes: `موافقة على استلام - فاتورة: ${receiptData.invoice_number || 'بدون'}`,
        });
        const { data: existing } = await supabase.from('warehouse_stock')
          .select('id, quantity').eq('branch_id', receiptData.branch_id).eq('product_id', item.product_id).maybeSingle();
        if (existing) { await supabase.from('warehouse_stock').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id); }
        else { await supabase.from('warehouse_stock').insert({ branch_id: receiptData.branch_id, product_id: item.product_id, quantity: item.quantity }); }
      }

      // Pallets
      const totalPallets = (rItems || []).reduce((sum, i: any) => sum + (Number(i.pallet_quantity) || 0), 0);
      if (totalPallets > 0) {
        const { data: bp } = await supabase.from('branch_pallets').select('id, quantity').eq('branch_id', receiptData.branch_id).maybeSingle();
        if (bp) { await supabase.from('branch_pallets').update({ quantity: bp.quantity + totalPallets }).eq('id', bp.id); }
        else { await supabase.from('branch_pallets').insert({ branch_id: receiptData.branch_id, quantity: totalPallets }); }
      }

      toast.success('تمت الموافقة على الاستلام');
      fetchPendingReceipts();
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (receiptId: string) => {
    if (!workerId) return;
    setProcessingId(receiptId);
    try {
      await supabase.from('stock_receipts').update({ status: 'rejected', approved_by: workerId, approved_at: new Date().toISOString() }).eq('id', receiptId);
      toast.success('تم رفض الاستلام');
      fetchPendingReceipts();
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setProcessingId(null);
    }
  };

  const viewReceiptItems = async (receiptId: string) => {
    if (viewingReceiptId === receiptId) { setViewingReceiptId(null); return; }
    setViewingReceiptId(receiptId);
    const { data } = await supabase.from('stock_receipt_items').select('quantity, product:products(name, image_url)').eq('receipt_id', receiptId);
    setPendingItems((data || []).map((i: any) => ({ product_name: i.product?.name || '', quantity: i.quantity, image_url: i.product?.image_url })));
  };

  const resetForm = () => {
    setItems([{ product_id: '', quantity: 1 }]);
    setInvoiceNumber('');
    setNotes('');
    setInvoicePhoto(null);
    setPhotoPreview(null);
    setPalletCount(0);
  };

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'اختر منتج';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-lime-600" />
            استلام من المصنع
          </DialogTitle>
        </DialogHeader>

        {/* Tabs for admin: create + pending approvals */}
        {isAdmin && (
          <div className="flex gap-2 mb-2">
            <Button variant={tab === 'create' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setTab('create')}>
              <Plus className="w-4 h-4 ml-1" /> إنشاء وصل
            </Button>
            <Button variant={tab === 'pending' ? 'default' : 'outline'} size="sm" className="flex-1 relative" onClick={() => { setTab('pending'); fetchPendingReceipts(); }}>
              طلبات معلقة
              {pendingReceipts.length > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -left-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {pendingReceipts.length}
                </Badge>
              )}
            </Button>
          </div>
        )}

        {tab === 'create' ? (
          <div className="space-y-3">
            {isWarehouseManager && !isAdmin && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ سيتم إرسال الطلب لمدير الفرع للموافقة قبل تحديث المخزون
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">رقم الفاتورة</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="text-right h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">🪵 باليطات</Label>
                <Input type="number" min={0} value={palletCount} onChange={e => setPalletCount(parseInt(e.target.value) || 0)} className="text-center h-8 text-sm" />
              </div>
            </div>

            {/* Photo */}
            <div>
              <Label className="text-xs flex items-center gap-1"><Camera className="w-3 h-3" /> صورة الفاتورة</Label>
              <Input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="text-xs h-8" />
              {photoPreview && <img src={photoPreview} className="mt-1 w-full h-24 object-cover rounded-lg" alt="preview" />}
            </div>

            <Label className="text-xs font-semibold text-muted-foreground">المنتجات</Label>
            {items.map((item, index) => (
              <div key={index} className="border rounded-lg p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-1.5 text-sm border rounded px-2 py-1.5 hover:bg-accent transition-colors"
                    onClick={() => setPickerIndex(index)}
                  >
                    <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className={item.product_id ? 'text-foreground truncate' : 'text-muted-foreground'}>
                      {item.product_id ? getProductName(item.product_id) : 'اختر منتج'}
                    </span>
                  </button>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(index)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">الكمية (صندوق)</Label>
                  <Input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="text-center text-sm h-8"
                  />
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
              <Plus className="w-4 h-4 ml-1" /> إضافة منتج
            </Button>

            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="text-right h-8 text-sm" />
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="w-full bg-lime-600 hover:bg-lime-700">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              {isWarehouseManager && !isAdmin ? 'إرسال للموافقة' : 'تأكيد الاستلام'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {isLoadingPending ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : pendingReceipts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">لا توجد طلبات معلقة</div>
            ) : (
              pendingReceipts.map(receipt => (
                <div key={receipt.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {receipt.invoice_number ? `فاتورة: ${receipt.invoice_number}` : 'استلام بدون فاتورة'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {receipt.creator_name} • {formatDate(receipt.created_at, 'dd/MM HH:mm', 'ar')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">بانتظار الموافقة</Badge>
                  </div>
                  
                  {receipt.notes && <p className="text-xs text-muted-foreground">{receipt.notes}</p>}
                  
                  <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => viewReceiptItems(receipt.id)}>
                    عرض المنتجات ({receipt.total_items} عنصر)
                  </Button>

                  {viewingReceiptId === receipt.id && pendingItems.length > 0 && (
                    <div className="bg-muted/50 rounded-lg p-2 space-y-1.5">
                      {pendingItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.product_name} className="w-8 h-8 rounded object-cover shrink-0 border" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0 border">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="flex-1 truncate">{item.product_name}</span>
                          <Badge variant="secondary" className="text-xs font-bold">{item.quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      disabled={processingId === receipt.id}
                      onClick={() => handleApprove(receipt.id)}
                    >
                      {processingId === receipt.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 ml-1" />}
                      موافقة
                    </Button>
                    <Button
                      size="sm" variant="destructive" className="flex-1"
                      disabled={processingId === receipt.id}
                      onClick={() => handleReject(receipt.id)}
                    >
                      <XCircle className="w-3.5 h-3.5 ml-1" /> رفض
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>

      <SimpleProductPickerDialog
        open={pickerIndex !== null}
        onOpenChange={(open) => { if (!open) setPickerIndex(null); }}
        products={products}
        selectedProductId={pickerIndex !== null ? items[pickerIndex]?.product_id || '' : ''}
        onSelect={(productId) => {
          if (pickerIndex !== null) updateItem(pickerIndex, 'product_id', productId);
        }}
      />
    </Dialog>
  );
};

export default FactoryReceiptQuickDialog;
