import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Camera, Trash2, ClipboardList, Image as ImageIcon, Package, Settings, Truck, ArrowDownToLine, ArrowUpFromLine, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SimpleProductPickerDialog from '@/components/stock/SimpleProductPickerDialog';
import PalletSettingsDialog from '@/components/stock/PalletSettingsDialog';
import FactoryDeliveryDialog from '@/components/stock/FactoryDeliveryDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWarehouseStock, StockReceiptItem, StockReceipt } from '@/hooks/useWarehouseStock';
import { formatDate } from '@/utils/formatters';
import { useIsElementHidden } from '@/hooks/useUIOverrides';

interface ReceiptItem {
  product_id: string;
  quantity: number;
}

// Pallet quantity received with this receipt

interface FactoryOrder {
  id: string;
  order_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
}

interface FactoryOrderItem {
  id: string;
  product_id: string;
  product_quantity: number;
  pallet_quantity: number;
  product?: { name: string };
}

const StockReceipts: React.FC = () => {
  const { t, language } = useLanguage();
  const { activeBranch } = useAuth();
  const navigate = useNavigate();
  const { receipts, products, createReceipt, isLoading, branchId, refresh } = useWarehouseStock();
  const isAddReceiptHidden = useIsElementHidden('button', 'add_stock_receipt');

  const [activeTab, setActiveTab] = useState('receiving');
  const [showDialog, setShowDialog] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([{ product_id: '', quantity: 1 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [invoicePhoto, setInvoicePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [receiptPallets, setReceiptPallets] = useState(0);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);

  // View receipt details
  const [viewReceipt, setViewReceipt] = useState<StockReceipt | null>(null);
  const [viewItems, setViewItems] = useState<StockReceiptItem[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Settings & Delivery dialogs
  const [showPalletSettings, setShowPalletSettings] = useState(false);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);

  // Factory sending orders
  const [sendingOrders, setSendingOrders] = useState<FactoryOrder[]>([]);
  const [viewSendingOrder, setViewSendingOrder] = useState<FactoryOrder | null>(null);
  const [sendingItems, setSendingItems] = useState<FactoryOrderItem[]>([]);
  const [isLoadingSending, setIsLoadingSending] = useState(false);

  const fetchSendingOrders = async () => {
    if (!branchId) return;
    const { data } = await supabase
      .from('factory_orders')
      .select('*')
      .eq('branch_id', branchId)
      .eq('order_type', 'sending')
      .order('created_at', { ascending: false })
      .limit(50);
    setSendingOrders(data || []);
  };

  useEffect(() => {
    if (branchId) fetchSendingOrders();
  }, [branchId]);

  const handleViewSendingOrder = async (order: FactoryOrder) => {
    setViewSendingOrder(order);
    setIsLoadingSending(true);
    try {
      const { data } = await supabase
        .from('factory_order_items')
        .select('*, product:products(name)')
        .eq('factory_order_id', order.id);
      setSendingItems((data || []) as unknown as FactoryOrderItem[]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSending(false);
    }
  };

  const handleViewReceipt = async (receipt: StockReceipt) => {
    setViewReceipt(receipt);
    setIsLoadingDetails(true);
    try {
      const { data } = await supabase
        .from('stock_receipt_items')
        .select('*, product:products(name, pieces_per_box)')
        .eq('receipt_id', receipt.id)
        .order('created_at', { ascending: true });
      setViewItems((data || []) as unknown as StockReceiptItem[]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDetails(false);
    }
  };

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
        validItems,
        receiptPallets
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
    setReceiptPallets(0);
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
          أوامر الاستلام والتسليم
        </h2>
        <Button size="sm" variant="outline" onClick={() => navigate('/warehouse')}>
          <BarChart3 className="w-4 h-4 ml-1" />
          مخزون الفرع
        </Button>
      </div>

      {!branchId && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            {t('branches.select_branch')}
          </CardContent>
        </Card>
      )}

      {branchId && (
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="receiving" className="gap-1.5">
              <ArrowDownToLine className="w-4 h-4" />
              استلام
            </TabsTrigger>
            <TabsTrigger value="sending" className="gap-1.5">
              <ArrowUpFromLine className="w-4 h-4" />
              تسليم
            </TabsTrigger>
          </TabsList>

          {/* ===== Receiving Tab ===== */}
          <TabsContent value="receiving" className="space-y-3 mt-3">
            <div className="flex items-center gap-2">
              {!isAddReceiptHidden && (
                <Button size="sm" onClick={() => setShowDialog(true)} className="flex-1">
                  <Plus className="w-4 h-4 ml-1" />
                  {t('stock.new_receipt')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowPalletSettings(true)}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>

            {receipts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t('stock.no_receipts')}
                </CardContent>
              </Card>
            ) : (
              receipts.map(receipt => (
                <Card key={receipt.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => handleViewReceipt(receipt)}>
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
                        <a href={receipt.invoice_photo_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <ImageIcon className="w-3 h-3" />
                          {t('stock.view_invoice')}
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ===== Sending Tab ===== */}
          <TabsContent value="sending" className="space-y-3 mt-3">
            <Button size="sm" onClick={() => setShowDeliveryDialog(true)} className="w-full" variant="destructive">
              <Truck className="w-4 h-4 ml-1" />
              تسليم جديد للمصنع
            </Button>

            {sendingOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  لا توجد عمليات تسليم للمصنع
                </CardContent>
              </Card>
            ) : (
              sendingOrders.map(order => (
                <Card key={order.id} className="cursor-pointer hover:border-destructive/50 transition-colors" onClick={() => handleViewSendingOrder(order)}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium">تسليم للمصنع</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(order.created_at, 'dd/MM/yyyy HH:mm', language)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={order.status === 'confirmed' ? 'default' : 'secondary'} className="text-[10px]">
                        {order.status === 'confirmed' ? 'مؤكد' : 'معلق'}
                      </Badge>
                      {order.notes && <span className="text-muted-foreground truncate">{order.notes}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* View Receipt Details Dialog */}
      <Dialog open={!!viewReceipt} onOpenChange={(open) => { if (!open) setViewReceipt(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              {t('stock.receipt_details')}
            </DialogTitle>
          </DialogHeader>

          {viewReceipt && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                {viewReceipt.invoice_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('stock.invoice_number')}</span>
                    <span className="font-medium">{viewReceipt.invoice_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('common.date')}</span>
                  <span>{formatDate(viewReceipt.created_at, 'dd/MM/yyyy HH:mm', language)}</span>
                </div>
                {viewReceipt.notes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.notes')}</span>
                    <span>{viewReceipt.notes}</span>
                  </div>
                )}
                {viewReceipt.invoice_photo_url && (
                  <a href={viewReceipt.invoice_photo_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 text-xs">
                    <ImageIcon className="w-3 h-3" />
                    {t('stock.view_invoice')}
                  </a>
                )}
              </div>

              <div className="border-t pt-3">
                <Label className="text-sm font-semibold mb-2 block">{t('stock.add_products')}</Label>
                {isLoadingDetails ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : viewItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('common.no_results')}</p>
                ) : (
                  <div className="space-y-2">
                    {viewItems.map((item: any) => (
                      <div key={item.id} className="rounded-lg border p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">{item.product?.name || item.product_id}</span>
                          </div>
                          <span className="text-sm font-bold text-primary">{item.quantity}</span>
                        </div>
                        {item.pallet_quantity > 0 && (
                          <div className="flex items-center justify-end">
                            <span className="text-xs font-medium text-amber-600">🪵 باليطات: {item.pallet_quantity}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Sending Order Details */}
      <Dialog open={!!viewSendingOrder} onOpenChange={(open) => { if (!open) setViewSendingOrder(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-destructive" />
              تفاصيل التسليم للمصنع
            </DialogTitle>
          </DialogHeader>

          {viewSendingOrder && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">التاريخ</span>
                  <span>{formatDate(viewSendingOrder.created_at, 'dd/MM/yyyy HH:mm', language)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الحالة</span>
                  <Badge variant={viewSendingOrder.status === 'confirmed' ? 'default' : 'secondary'}>
                    {viewSendingOrder.status === 'confirmed' ? 'مؤكد' : 'معلق'}
                  </Badge>
                </div>
                {viewSendingOrder.notes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ملاحظات</span>
                    <span>{viewSendingOrder.notes}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <Label className="text-sm font-semibold mb-2 block">المنتجات والباليطات</Label>
                {isLoadingSending ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : sendingItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد بنود</p>
                ) : (
                  <div className="space-y-2">
                    {sendingItems.map((item) => (
                      <div key={item.id} className="rounded-lg border p-2.5 space-y-1">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-destructive" />
                          <span className="text-sm font-medium">{item.product?.name || item.product_id}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          {item.product_quantity > 0 && (
                            <span className="text-destructive font-medium">تالف: {item.product_quantity} صندوق</span>
                          )}
                          {item.pallet_quantity > 0 && (
                            <span className="text-amber-600 font-medium">باليطات: {item.pallet_quantity}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              <Label>🪵 عدد الباليطات المستلمة (اختياري)</Label>
              <Input
                type="number"
                min={0}
                value={receiptPallets}
                onChange={e => setReceiptPallets(parseInt(e.target.value) || 0)}
                className="text-center"
                placeholder="0"
              />
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

      {branchId && (
        <>
          <PalletSettingsDialog
            open={showPalletSettings}
            onOpenChange={setShowPalletSettings}
            branchId={branchId}
            products={products}
          />
          <FactoryDeliveryDialog
            open={showDeliveryDialog}
            onOpenChange={setShowDeliveryDialog}
            branchId={branchId}
            products={products}
            onSuccess={() => { fetchSendingOrders(); refresh(); }}
          />
        </>
      )}
    </div>
  );
};

export default StockReceipts;
