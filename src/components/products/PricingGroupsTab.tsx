import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Trash2, Package, Layers, Pencil, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/types/database';

interface PricingGroup {
  id: string;
  name: string;
  created_at: string;
  products?: Product[];
}

const PricingGroupsTab: React.FC = () => {
  const { workerId } = useAuth();
  const [groups, setGroups] = useState<PricingGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit dialog
  const [editingGroup, setEditingGroup] = useState<PricingGroup | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editSelectedProducts, setEditSelectedProducts] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Delete dialog
  const [groupToDelete, setGroupToDelete] = useState<PricingGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Sync prices dialog
  const [syncGroup, setSyncGroup] = useState<PricingGroup | null>(null);
  const [syncSourceProductId, setSyncSourceProductId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchData();

    // Realtime for products, pricing_groups, product_pricing_groups
    const baseChannelName = 'pricing-groups-realtime';
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_groups' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_pricing_groups' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [groupsRes, productsRes, mappingsRes] = await Promise.all([
        supabase.from('pricing_groups').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('product_pricing_groups').select('*'),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (mappingsRes.error) throw mappingsRes.error;

      const groupsWithProducts = (groupsRes.data || []).map(group => ({
        ...group,
        products: productsRes.data?.filter(p => 
          mappingsRes.data?.some(m => m.group_id === group.id && m.product_id === p.id)
        ) || [],
      }));

      setGroups(groupsWithProducts);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('فشل تحميل البيانات');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error('الرجاء إدخال اسم المجموعة');
      return;
    }

    setIsSaving(true);
    try {
      const { data: newGroup, error: groupError } = await supabase
        .from('pricing_groups')
        .insert({ name: groupName.trim(), created_by: workerId })
        .select()
        .single();

      if (groupError) throw groupError;

      if (selectedProducts.length > 0) {
        const mappings = selectedProducts.map(productId => ({
          group_id: newGroup.id,
          product_id: productId,
        }));
        const { error: mappingError } = await supabase
          .from('product_pricing_groups')
          .insert(mappings);
        if (mappingError) throw mappingError;
      }

      toast.success('تم إنشاء المجموعة بنجاح');
      setShowAddDialog(false);
      setGroupName('');
      setSelectedProducts([]);
      fetchData();
    } catch (error: any) {
      console.error('Error adding group:', error);
      toast.error(error.message || 'فشل إنشاء المجموعة');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDialog = (group: PricingGroup) => {
    setEditingGroup(group);
    setEditGroupName(group.name);
    setEditSelectedProducts(group.products?.map(p => p.id) || []);
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    if (!editGroupName.trim()) {
      toast.error('الرجاء إدخال اسم المجموعة');
      return;
    }

    setIsUpdating(true);
    try {
      // Update group name
      const { error: groupError } = await supabase
        .from('pricing_groups')
        .update({ name: editGroupName.trim() })
        .eq('id', editingGroup.id);
      if (groupError) throw groupError;

      // Delete existing mappings
      const { error: deleteError } = await supabase
        .from('product_pricing_groups')
        .delete()
        .eq('group_id', editingGroup.id);
      if (deleteError) throw deleteError;

      // Add new mappings
      if (editSelectedProducts.length > 0) {
        const mappings = editSelectedProducts.map(productId => ({
          group_id: editingGroup.id,
          product_id: productId,
        }));
        const { error: mappingError } = await supabase
          .from('product_pricing_groups')
          .insert(mappings);
        if (mappingError) throw mappingError;
      }

      toast.success('تم تحديث المجموعة بنجاح');
      setEditingGroup(null);
      fetchData();
    } catch (error: any) {
      console.error('Error updating group:', error);
      toast.error(error.message || 'فشل تحديث المجموعة');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('pricing_groups')
        .delete()
        .eq('id', groupToDelete.id);

      if (error) throw error;

      toast.success('تم حذف المجموعة بنجاح');
      setGroupToDelete(null);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting group:', error);
      toast.error(error.message || 'فشل حذف المجموعة');
    } finally {
      setIsDeleting(false);
    }
  };

  const openSyncDialog = async (group: PricingGroup) => {
    // Fetch fresh product data to ensure prices are up-to-date
    const productIds = group.products?.map(p => p.id) || [];
    if (productIds.length === 0) return;
    
    const { data: freshProducts } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);
    
    const updatedGroup = {
      ...group,
      products: (freshProducts || []) as Product[],
    };
    
    setSyncGroup(updatedGroup);
    setSyncSourceProductId(updatedGroup.products?.[0]?.id || '');
  };

  const handleSyncPrices = async () => {
    if (!syncGroup || !syncSourceProductId) return;
    const sourceProduct = syncGroup.products?.find(p => p.id === syncSourceProductId);
    if (!sourceProduct) return;

    const targetIds = syncGroup.products?.filter(p => p.id !== syncSourceProductId).map(p => p.id) || [];
    if (targetIds.length === 0) {
      toast.info('لا توجد منتجات أخرى لتحديثها');
      return;
    }

    setIsSyncing(true);
    try {
      // Update each product individually to ensure RLS doesn't silently skip
      const updatePromises = targetIds.map(id =>
        supabase
          .from('products')
          .update({
            price_super_gros: sourceProduct.price_super_gros,
            price_gros: sourceProduct.price_gros,
            price_invoice: sourceProduct.price_invoice,
            price_retail: sourceProduct.price_retail,
          })
          .eq('id', id)
          .select()
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);
      const updatedCount = results.filter(r => r.data && r.data.length > 0).length;

      if (errors.length > 0) {
        console.error('Sync errors:', errors.map(r => r.error));
        throw errors[0].error;
      }

      if (updatedCount === 0) {
        toast.error('لم يتم تحديث أي منتج - تحقق من الصلاحيات');
        return;
      }

      if (updatedCount < targetIds.length) {
        toast.warning(`تم تحديث ${updatedCount} من ${targetIds.length} منتج فقط`);
      } else {
        toast.success(`تم توحيد أسعار ${updatedCount + 1} منتج`);
      }

      setSyncGroup(null);
      fetchData();
    } catch (error: any) {
      console.error('Error syncing prices:', error);
      toast.error(error.message || 'فشل توحيد الأسعار');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleProduct = (productId: string, list: string[], setList: (val: string[]) => void) => {
    if (list.includes(productId)) {
      setList(list.filter(id => id !== productId));
    } else {
      setList([...list, productId]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          إدارة مجموعات التسعير للمنتجات
        </p>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 ml-2" />
              مجموعة جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء مجموعة تسعير</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddGroup} className="flex flex-col flex-1 overflow-hidden">
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                <div className="space-y-2">
                  <Label>اسم المجموعة</Label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="مثال: منتجات الفئة أ"
                    className="text-right"
                    autoFocus
                  />
                </div>
                
                <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
                  <Label>المنتجات ({selectedProducts.length} محدد)</Label>
                  <ScrollArea className="h-[40vh] border rounded-md p-2">
                    <div className="space-y-2">
                      {products.map((product) => (
                        <label
                          key={product.id}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedProducts.includes(product.id)}
                            onCheckedChange={() => toggleProduct(product.id, selectedProducts, setSelectedProducts)}
                          />
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <span className="flex-1">{product.name}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              
              <Button type="submit" className="w-full mt-4" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  'إنشاء المجموعة'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups List */}
      <div className="space-y-3">
        {groups.map((group) => (
          <Card key={group.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold">{group.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {group.products?.length || 0} منتج
                    </p>
                    {group.products && group.products.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {group.products.slice(0, 5).map((product) => (
                          <span
                            key={product.id}
                            className="text-xs px-2 py-0.5 bg-muted rounded-full"
                          >
                            {product.name}
                          </span>
                        ))}
                        {group.products.length > 5 && (
                          <span className="text-xs px-2 py-0.5 bg-muted rounded-full">
                            +{group.products.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary hover:text-primary"
                    onClick={() => openSyncDialog(group)}
                    title="توحيد الأسعار"
                    disabled={!group.products || group.products.length < 2}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(group)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setGroupToDelete(group)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {groups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>لا توجد مجموعات تسعير</p>
            <p className="text-xs mt-1">أنشئ مجموعة لربط منتجات بنفس التسعير</p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المجموعة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateGroup} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              <div className="space-y-2">
                <Label>اسم المجموعة</Label>
                <Input
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="اسم المجموعة"
                  className="text-right"
                />
              </div>
              
              <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
                <Label>المنتجات ({editSelectedProducts.length} محدد)</Label>
                <ScrollArea className="h-[40vh] border rounded-md p-2">
                  <div className="space-y-2">
                    {products.map((product) => (
                      <label
                        key={product.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={editSelectedProducts.includes(product.id)}
                          onCheckedChange={() => toggleProduct(product.id, editSelectedProducts, setEditSelectedProducts)}
                        />
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1">{product.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
            
            <Button type="submit" className="w-full mt-4" disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                'حفظ التغييرات'
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المجموعة "{groupToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                'حذف'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync Prices Dialog */}
      <Dialog open={!!syncGroup} onOpenChange={(open) => !open && setSyncGroup(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5" />
              توحيد أسعار المجموعة "{syncGroup?.name}"
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اختر المنتج المرجعي لنسخ أسعاره إلى باقي منتجات المجموعة:
            </p>
            <Select value={syncSourceProductId} onValueChange={setSyncSourceProductId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المنتج المرجعي" />
              </SelectTrigger>
              <SelectContent>
                {syncGroup?.products?.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {syncSourceProductId && (() => {
              const src = syncGroup?.products?.find(p => p.id === syncSourceProductId);
              if (!src) return null;
              return (
                <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
                  <p className="font-medium mb-2">أسعار المنتج المرجعي:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-muted-foreground">سبر غرو:</span>
                    <span className="font-medium">{src.price_super_gros || 0} دج</span>
                    <span className="text-muted-foreground">غرو:</span>
                    <span className="font-medium">{src.price_gros || 0} دج</span>
                    <span className="text-muted-foreground">فاتورة:</span>
                    <span className="font-medium">{src.price_invoice || 0} دج</span>
                    <span className="text-muted-foreground">تجزئة:</span>
                    <span className="font-medium">{src.price_retail || 0} دج</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSyncGroup(null)}>
                إلغاء
              </Button>
              <Button className="flex-1" onClick={handleSyncPrices} disabled={isSyncing || !syncSourceProductId}>
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري التوحيد...
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 ml-2" />
                    توحيد الأسعار
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PricingGroupsTab;
