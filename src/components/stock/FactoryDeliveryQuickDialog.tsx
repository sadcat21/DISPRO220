import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, Trash2, Loader2, Truck, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/utils';
import SimpleProductPickerDialog from './SimpleProductPickerDialog';
import { formatDate } from '@/utils/formatters';

interface DeliveryItem {
  product_id: string;
  quantity: number;
}

interface PendingDelivery {
  id: string;
  notes: string | null;
  status: string;
  created_at: string;
  created_by: string;
  creator_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FactoryDeliveryQuickDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { workerId, role, activeRole, activeBranch } = useAuth();
  const [items, setItems] = useState<DeliveryItem[]>([{ product_id: '', quantity: 0 }]);
  const [palletCount, setPalletCount] = useState(0);
  const [currentPallets, setCurrentPallets] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; image_url?: string | null }[]>([]);
  const [tab, setTab] = useState<'create' | 'pending'>('create');
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<{ product_name: string; quantity: number; image_url?: string | null }[]>([]);
  const [pendingPallets, setPendingPallets] = useState(0);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const isWarehouseManager = activeRole?.custom_role_code === 'warehouse_manager';
  const isAdmin = isAdminRole(role);

  useEffect(() => {
    if (!open) return;
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

    // Fetch pallet balance
    supabase.from('branch_pallets').select('quantity').eq('branch_id', branchId).maybeSingle()
      .then(({ data }) => {
        const qty = data?.quantity || 0;
        setCurrentPallets(qty);
        setPalletCount(qty);
      });

    // Auto-suggest damaged products
    supabase.from('warehouse_stock')
      .select('product_id, damaged_quantity, factory_return_quantity')
      .eq('branch_id', branchId)
      .gt('damaged_quantity', 0)
      .then(({ data }) => {
        const suggestions: DeliveryItem[] = [];
        for (const row of (data || [])) {
          const remaining = Number(row.damaged_quantity || 0) - Number(row.factory_return_quantity || 0);
          if (remaining > 0) {
            suggestions.push({ product_id: row.product_id, quantity: Math.round(remaining * 100) / 100 });
          }
        }
        setItems(suggestions.length > 0 ? suggestions : [{ product_id: '', quantity: 0 }]);
      });

    fetchPendingDeliveries();
  }, [open, branchId]);

  const fetchPendingDeliveries = async () => {
    if (!branchId) return;
    setIsLoadingPending(true);
    const { data } = await supabase
      .from('factory_orders')
      .select('id, notes, status, created_at, created_by')
      .eq('branch_id', branchId)
      .eq('order_type', 'sending')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    const deliveries = data || [];
    if (deliveries.length > 0) {
      const creatorIds = [...new Set(deliveries.map(d => d.created_by))];
      const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', creatorIds);
      const workerMap = new Map((workers || []).map(w => [w.id, w.full_name]));
      deliveries.forEach(d => { (d as any).creator_name = workerMap.get(d.created_by) || ''; });
    }

    setPendingDeliveries(deliveries as PendingDelivery[]);
    setIsLoadingPending(false);
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', quantity: 0 }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(prev => prev.filter((_, idx) => idx !== i)); };
  const updateItem = (i: number, field: keyof DeliveryItem, value: any) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0 && palletCount === 0) { toast.error('أضف منتجات تالفة أو باليطات'); return; }
    if (!branchId || !workerId) { toast.error('اختر الفرع أولاً'); return; }

    setIsSaving(true);
    try {
      const status = isWarehouseManager && !isAdmin ? 'pending_approval' : 'confirmed';

      const { data: order, error: orderError } = await supabase
        .from('factory_orders')
        .insert({
          order_type: 'sending',
          branch_id: branchId,
          status,
          notes: notes || null,
          created_by: workerId,
          confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
          pallet_count: palletCount,
        } as any)
        .select()
        .single();
      if (orderError) throw orderError;

      // Insert items
      if (validItems.length > 0) {
        const orderItems = validItems.map(i => ({
          factory_order_id: order.id,
          product_id: i.product_id,
          product_quantity: i.quantity,
          pallet_quantity: 0,
        }));
        const { error: itemsError } = await supabase.from('factory_order_items').insert(orderItems);
        if (itemsError) throw itemsError;
      }

      if (status === 'confirmed') {
        await applyDeliveryStock(order.id, validItems, palletCount, branchId);
        toast.success('تم تأكيد التسليم للمصنع');
      } else {
        toast.success('تم إرسال طلب التسليم للموافقة');
      }

      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  const applyDeliveryStock = async (orderId: string, validItems: DeliveryItem[], pallets: number, bId: string) => {
    // Update warehouse_stock: deduct damaged, add factory_return
    for (const item of validItems) {
      if (item.quantity > 0) {
        const { data: stock } = await supabase
          .from('warehouse_stock')
          .select('id, damaged_quantity, factory_return_quantity')
          .eq('branch_id', bId)
          .eq('product_id', item.product_id)
          .maybeSingle();

        if (stock) {
          const currentDamaged = Number(stock.damaged_quantity) || 0;
          const currentReturn = Number(stock.factory_return_quantity) || 0;
          await supabase.from('warehouse_stock').update({
            damaged_quantity: Math.max(0, currentDamaged - item.quantity),
            factory_return_quantity: currentReturn + item.quantity,
          }).eq('id', stock.id);
        }
      }
    }

    // Deduct pallets
    if (pallets > 0) {
      const { data: bp } = await supabase.from('branch_pallets').select('id, quantity').eq('branch_id', bId).maybeSingle();
      if (bp) {
        await supabase.from('branch_pallets').update({ quantity: Math.max(0, bp.quantity - pallets) }).eq('id', bp.id);
      }
      await supabase.from('pallet_movements').insert({
        branch_id: bId, quantity: -pallets, movement_type: 'delivery',
        reference_id: orderId, notes: 'تسليم باليطات للمصنع', created_by: workerId,
      });
    }
  };

  const handleApprove = async (deliveryId: string) => {
    if (!workerId || !branchId) return;
    setProcessingId(deliveryId);
    try {
      const { data: orderData } = await supabase.from('factory_orders').select('*').eq('id', deliveryId).single();
      if (!orderData || orderData.status !== 'pending_approval') { toast.error('هذا الطلب تمت معالجته'); return; }

      const { data: oItems } = await supabase.from('factory_order_items').select('*').eq('factory_order_id', deliveryId);

      await supabase.from('factory_orders').update({
        status: 'confirmed', confirmed_at: new Date().toISOString(),
      }).eq('id', deliveryId);

      const validItems = (oItems || []).filter((i: any) => i.product_quantity > 0).map((i: any) => ({
        product_id: i.product_id, quantity: i.product_quantity,
      }));

      const pallets = Number((orderData as any).pallet_count) || 0;
      await applyDeliveryStock(deliveryId, validItems, pallets, orderData.branch_id);

      toast.success('تمت الموافقة على التسليم');
      fetchPendingDeliveries();
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (deliveryId: string) => {
    if (!workerId) return;
    setProcessingId(deliveryId);
    try {
      await supabase.from('factory_orders').update({ status: 'rejected' }).eq('id', deliveryId);
      toast.success('تم رفض التسليم');
      fetchPendingDeliveries();
    } catch (e: any) {
      toast.error(e.message || 'خطأ');
    } finally {
      setProcessingId(null);
    }
  };

  const viewDeliveryItems = async (deliveryId: string) => {
    if (viewingId === deliveryId) { setViewingId(null); return; }
    setViewingId(deliveryId);
    const { data: oItems } = await supabase.from('factory_order_items')
      .select('product_quantity, product:products(name, image_url)').eq('factory_order_id', deliveryId);
    setPendingItems((oItems || []).map((i: any) => ({
      product_name: i.product?.name || '', quantity: i.product_quantity, image_url: i.product?.image_url,
    })));
    const { data: orderData } = await supabase.from('factory_orders').select('*').eq('id', deliveryId).single();
    setPendingPallets(Number((orderData as any)?.pallet_count) || 0);
  };

  const resetForm = () => {
    setItems([{ product_id: '', quantity: 0 }]);
    setPalletCount(0);
    setNotes('');
  };

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'اختر منتج';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-destructive" />
            تسليم للمصنع
          </DialogTitle>
        </DialogHeader>

        {isAdmin && (
          <div className="flex gap-2 mb-2">
            <Button variant={tab === 'create' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setTab('create')}>
              <Plus className="w-4 h-4 ml-1" /> إنشاء تسليم
            </Button>
            <Button variant={tab === 'pending' ? 'default' : 'outline'} size="sm" className="flex-1 relative" onClick={() => { setTab('pending'); fetchPendingDeliveries(); }}>
              طلبات معلقة
              {pendingDeliveries.length > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -left-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {pendingDeliveries.length}
                </Badge>
              )}
            </Button>
          </div>
        )}

        {tab === 'create' ? (
          <div className="space-y-3">
            {isWarehouseManager && !isAdmin && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ سيتم إرسال الطلب لمدير الفرع للموافقة قبل تطبيق التغييرات
              </div>
            )}

            {/* Pallet Field */}
            <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">🪵 باليطات للتسليم</Label>
              <div className="flex items-center gap-3">
                <Input type="number" min={0} value={palletCount}
                  onChange={e => setPalletCount(parseInt(e.target.value) || 0)}
                  className="text-center text-sm h-9 w-28" />
                <span className="text-xs text-muted-foreground">
                  الرصيد: <span className="font-bold text-foreground">{currentPallets}</span>
                </span>
              </div>
            </div>

            <Label className="text-xs font-semibold text-muted-foreground">المنتجات التالفة</Label>
            {items.map((item, index) => (
              <div key={index} className="border rounded-lg p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <button type="button"
                    className="flex-1 flex items-center gap-1.5 text-sm border rounded px-2 py-1.5 hover:bg-accent transition-colors"
                    onClick={() => setPickerIndex(index)}>
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
                  <Label className="text-[10px] text-muted-foreground">كمية التالف (صندوق)</Label>
                  <Input type="number" min={0} value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="text-center text-sm h-8" />
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" className="w-full" onClick={addItem}>
              <Plus className="w-4 h-4 ml-1" /> إضافة منتج تالف
            </Button>

            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="text-right h-8 text-sm" />
            </div>

            <Button onClick={handleSave} disabled={isSaving} variant="destructive" className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              {isWarehouseManager && !isAdmin ? 'إرسال للموافقة' : 'تأكيد التسليم'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {isLoadingPending ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : pendingDeliveries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">لا توجد طلبات معلقة</div>
            ) : (
              pendingDeliveries.map(delivery => (
                <div key={delivery.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">تسليم تالف للمصنع</p>
                      <p className="text-xs text-muted-foreground">
                        {delivery.creator_name} • {formatDate(delivery.created_at, 'dd/MM HH:mm', 'ar')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">بانتظار الموافقة</Badge>
                  </div>

                  {delivery.notes && <p className="text-xs text-muted-foreground">{delivery.notes}</p>}

                  <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => viewDeliveryItems(delivery.id)}>
                    عرض التفاصيل
                  </Button>

                  {viewingId === delivery.id && (
                    <div className="bg-muted/50 rounded-lg p-2 space-y-1.5">
                      {pendingPallets > 0 && (
                        <div className="flex items-center justify-between text-xs border-b pb-1 mb-1">
                          <span className="font-semibold">🪵 باليطات</span>
                          <Badge variant="secondary" className="text-xs font-bold">{pendingPallets}</Badge>
                        </div>
                      )}
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
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      disabled={processingId === delivery.id} onClick={() => handleApprove(delivery.id)}>
                      {processingId === delivery.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 ml-1" />}
                      موافقة
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1"
                      disabled={processingId === delivery.id} onClick={() => handleReject(delivery.id)}>
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
        onSelect={(productId) => { if (pickerIndex !== null) updateItem(pickerIndex, 'product_id', productId); }}
      />
    </Dialog>
  );
};

export default FactoryDeliveryQuickDialog;
