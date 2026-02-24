import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PromoWithDetails, Customer, Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Package, Calendar, User, Loader2, Search, Pencil, Trash2, Activity, Plus } from 'lucide-react';
import AddPromoDialog from '@/components/promo/AddPromoDialog';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { useLogActivity, useMyActivityLogs } from '@/hooks/useActivityLogs';
import { ACTION_TYPES, ENTITY_TYPES } from '@/types/activityLog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import PermissionGate from '@/components/auth/PermissionGate';
import { useIsElementHidden } from '@/hooks/useUIOverrides';

const getDateLocale = (language: string) => {
  switch (language) {
    case 'fr': return fr;
    case 'en': return enUS;
    default: return ar;
  }
};

const MyPromosContent: React.FC = () => {
  const [deletePromo, setDeletePromo] = useState<PromoWithDetails | null>(null);
  const { workerId, activeBranch } = useAuth();
  const { t, language } = useLanguage();
  const [promos, setPromos] = useState<PromoWithDetails[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoWithDetails | null>(null);
  const [editVente, setEditVente] = useState(0);
  const [editGratuite, setEditGratuite] = useState(0);
  const [editCustomer, setEditCustomer] = useState('');
  const [editProduct, setEditProduct] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Add promo dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const logActivity = useLogActivity();
  const { data: myLogs } = useMyActivityLogs();

  // UI override checks
  const isAddPromoHidden = useIsElementHidden('button', 'add_promo');
  const isEditPromoHidden = useIsElementHidden('action', 'edit_promo');
  const isDeletePromoHidden = useIsElementHidden('action', 'delete_promo');

  useEffect(() => {
    if (workerId) {
      fetchData();
    }
  }, [workerId, activeBranch]);

  const fetchData = async () => {
    try {
      const [promosRes, customersRes, productsRes] = await Promise.all([
        supabase
          .from('promos')
          .select(`*, customer:customers(*), product:products(*)`)
          .eq('worker_id', workerId)
          .order('promo_date', { ascending: false }),
        supabase.from('customers').select('*').order('name'),
        supabase.from('products').select('*').eq('is_active', true).order('name'),
      ]);

      if (promosRes.error) throw promosRes.error;
      setPromos((promosRes.data || []) as PromoWithDetails[]);
      if (customersRes.data) setCustomers(customersRes.data);
      if (productsRes.data) setProducts(productsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('stats.load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (promo: PromoWithDetails) => {
    setEditingPromo(promo);
    setEditVente(promo.vente_quantity);
    setEditGratuite(promo.gratuite_quantity);
    setEditCustomer(promo.customer_id);
    setEditProduct(promo.product_id);
    setEditNotes(promo.notes || '');
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPromo) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('promos')
        .update({
          vente_quantity: editVente,
          gratuite_quantity: editGratuite,
          customer_id: editCustomer,
          product_id: editProduct,
          notes: editNotes || null,
        })
        .eq('id', editingPromo.id);

      if (error) throw error;

      // Log activity
      await logActivity.mutateAsync({
        actionType: 'update',
        entityType: 'promo',
        entityId: editingPromo.id,
        details: {
          الكمية_المباعة: editVente,
          الكمية_المجانية: editGratuite,
        },
      });

      toast.success(t('common.operation_updated'));
      setShowEditDialog(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (promo: PromoWithDetails) => {

    try {
      const { error } = await supabase
        .from('promos')
        .delete()
        .eq('id', promo.id);

      if (error) throw error;

      // Log activity
      await logActivity.mutateAsync({
        actionType: 'delete',
        entityType: 'promo',
        entityId: promo.id,
        details: {
          العميل: promo.customer?.name,
          المنتج: promo.product?.name,
        },
      });

      toast.success(t('common.operation_deleted'));
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Filter promos based on search query
  const filteredPromos = useMemo(() => {
    if (!searchQuery.trim()) return promos;
    
    const query = searchQuery.toLowerCase();
    return promos.filter((promo) => 
      promo.customer?.name?.toLowerCase().includes(query) ||
      promo.product?.name?.toLowerCase().includes(query) ||
      promo.customer?.wilaya?.toLowerCase().includes(query) ||
      promo.notes?.toLowerCase().includes(query)
    );
  }, [promos, searchQuery]);

  const totalVente = useMemo(() => 
    filteredPromos.reduce((sum, p) => sum + p.vente_quantity, 0), 
    [filteredPromos]
  );
  
  const totalGratuite = useMemo(() => 
    filteredPromos.reduce((sum, p) => sum + p.gratuite_quantity, 0), 
    [filteredPromos]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-primary-foreground/80 text-sm">{t('common.sales')}</p>
              <p className="text-3xl font-bold">{totalVente}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-l from-green-600 to-green-500 text-white">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-white/80 text-sm">{t('common.free')}</p>
              <p className="text-3xl font-bold">{totalGratuite}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add New Promo Button */}
      {!isAddPromoHidden && (
        <Button 
          onClick={() => setShowAddDialog(true)} 
          className="w-full gap-2"
          size="lg"
        >
          <Plus className="w-5 h-5" />
          {t('promos.add_new')}
        </Button>
      )}

      {/* Tabs */}
      <Tabs defaultValue="promos" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="promos">{t('common.my_operations')}</TabsTrigger>
          <TabsTrigger value="activity">{t('common.events')}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="promos" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search_placeholder')}
              className="pr-10 text-right"
            />
          </div>

          {/* Promos List */}
          <div>
            <h3 className="text-lg font-bold mb-3">{t('common.promo_record')} ({filteredPromos.length})</h3>
            
            {filteredPromos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{searchQuery ? t('common.no_results') : t('common.no_promos')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPromos.map((promo) => (
                  <Card key={promo.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="bg-primary/10 text-primary px-2 py-1 rounded-md text-sm font-bold">
                              {promo.vente_quantity} {t('common.sales')}
                            </span>
                            {promo.gratuite_quantity > 0 && (
                              <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-md text-sm font-bold">
                                {promo.gratuite_quantity} {t('common.free')}
                              </span>
                            )}
                            <span className="font-bold">{promo.product?.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="w-4 h-4" />
                            <span>{promo.customer?.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {format(new Date(promo.promo_date), 'dd MMM yyyy - HH:mm', { locale: getDateLocale(language) })}
                            </span>
                          </div>
                          {promo.notes && (
                            <p className="text-sm text-muted-foreground mt-2 bg-muted/50 p-2 rounded">
                              {promo.notes}
                            </p>
                          )}
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex flex-col gap-2">
                          {!isEditPromoHidden && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(promo)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {!isDeletePromoHidden && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeletePromo(promo)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="activity" className="mt-4">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-3">
              {myLogs?.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">
                        {ACTION_TYPES[log.action_type] || log.action_type}
                      </Badge>
                      <Badge variant="secondary">
                        {ENTITY_TYPES[log.entity_type] || log.entity_type}
                      </Badge>
                    </div>
                    {log.details && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {Object.entries(log.details).map(([key, value]) => (
                          <span key={key} className="mr-2">{key}: {String(value)}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: getDateLocale(language) })}
                    </p>
                  </CardContent>
                </Card>
              ))}
              
              {(!myLogs || myLogs.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{t('common.no_events')}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{t('common.edit_operation')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('print.customer')}</Label>
              <Select value={editCustomer} onValueChange={setEditCustomer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t('products.name')}</Label>
              <Select value={editProduct} onValueChange={setEditProduct}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.sale_quantity')}</Label>
                <Input
                  type="number"
                  value={editVente}
                  onChange={(e) => setEditVente(Number(e.target.value))}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.free_quantity')}</Label>
                <Input
                  type="number"
                  value={editGratuite}
                  onChange={(e) => setEditGratuite(Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t('common.notes')}</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="text-right"
              />
            </div>
            
            <Button onClick={handleSaveEdit} className="w-full" disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              {t('common.save_changes')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Promo Dialog */}
      <AddPromoDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        product={selectedProduct}
        onSuccess={() => {
          fetchData();
          setSelectedProduct(null);
        }}
      />
      {/* Confirm Delete Dialog */}
      <AlertDialog open={!!deletePromo} onOpenChange={() => setDeletePromo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-destructive" />حذف السجل</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذه العملية.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deletePromo) handleDelete(deletePromo); setDeletePromo(null); }}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const MyPromos: React.FC = () => {
  return (
    <PermissionGate 
      requiredPermissions={['page_my_promos', 'view_promos', 'create_promos']}
      redirectTo="/"
    >
      <MyPromosContent />
    </PermissionGate>
  );
};

export default MyPromos;
