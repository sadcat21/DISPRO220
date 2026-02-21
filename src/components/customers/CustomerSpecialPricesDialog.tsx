import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Tag, Package } from 'lucide-react';
import { Customer, Product } from '@/types/database';
import SimpleProductPickerDialog from '@/components/stock/SimpleProductPickerDialog';

interface CustomerSpecialPricesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

interface SpecialPrice {
  id: string;
  product_id: string;
  special_price: number;
  price_type: string;
  notes: string | null;
  product?: Product;
}

const CustomerSpecialPricesDialog: React.FC<CustomerSpecialPricesDialogProps> = ({
  open,
  onOpenChange,
  customer
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [newPrice, setNewPrice] = useState({
    product_id: '',
    special_price: '',
    price_type: 'fixed',
    notes: ''
  });
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Product[];
    }
  });

  // Fetch customer special prices
  const { data: specialPrices = [], refetch } = useQuery({
    queryKey: ['customer-special-prices', customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      const { data, error } = await supabase
        .from('customer_special_prices')
        .select('*, products(*)')
        .eq('customer_id', customer.id);
      if (error) throw error;
      return data.map(sp => ({
        ...sp,
        product: sp.products as Product
      })) as SpecialPrice[];
    },
    enabled: !!customer?.id && open
  });

  const handleAddSpecialPrice = async () => {
    if (!customer?.id || !newPrice.product_id || !newPrice.special_price) {
      toast({ title: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('customer_special_prices')
        .upsert({
          customer_id: customer.id,
          product_id: newPrice.product_id,
          special_price: parseFloat(newPrice.special_price),
          price_type: newPrice.price_type,
          notes: newPrice.notes || null
        }, {
          onConflict: 'customer_id,product_id'
        });

      if (error) throw error;

      toast({ title: 'تم إضافة السعر الخاص بنجاح' });
      setNewPrice({ product_id: '', special_price: '', price_type: 'fixed', notes: '' });
      refetch();
    } catch (error: any) {
      toast({ title: 'خطأ في إضافة السعر', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSpecialPrice = async (id: string) => {
    try {
      const { error } = await supabase
        .from('customer_special_prices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'تم حذف السعر الخاص' });
      refetch();
    } catch (error: any) {
      toast({ title: 'خطأ في الحذف', description: error.message, variant: 'destructive' });
    }
  };

  const usedProductIds = specialPrices.map(sp => sp.product_id);
  const availableProducts = products.filter(p => !usedProductIds.includes(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            الأسعار الخاصة - {customer?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new special price */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <h4 className="font-medium mb-3">إضافة سعر خاص جديد</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>المنتج</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start h-10 mt-1"
                  onClick={() => setProductPickerOpen(true)}
                >
                  {newPrice.product_id ? (
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      {availableProducts.find(p => p.id === newPrice.product_id)?.name || products.find(p => p.id === newPrice.product_id)?.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">اختر منتج</span>
                  )}
                </Button>
                <SimpleProductPickerDialog
                  open={productPickerOpen}
                  onOpenChange={setProductPickerOpen}
                  products={availableProducts.map(p => ({ id: p.id, name: p.name }))}
                  selectedProductId={newPrice.product_id}
                  onSelect={(id) => setNewPrice(p => ({ ...p, product_id: id }))}
                />
              </div>

              <div>
                <Label>نوع السعر</Label>
                <Select value={newPrice.price_type} onValueChange={(v) => setNewPrice(p => ({ ...p, price_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">سعر ثابت</SelectItem>
                    <SelectItem value="discount_percent">نسبة خصم %</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{newPrice.price_type === 'fixed' ? 'السعر (دج)' : 'نسبة الخصم %'}</Label>
                <Input
                  type="number"
                  value={newPrice.special_price}
                  onChange={(e) => setNewPrice(p => ({ ...p, special_price: e.target.value }))}
                  placeholder={newPrice.price_type === 'fixed' ? '0.00' : '10'}
                />
              </div>

              <div>
                <Label>ملاحظات</Label>
                <Input
                  value={newPrice.notes}
                  onChange={(e) => setNewPrice(p => ({ ...p, notes: e.target.value }))}
                  placeholder="ملاحظات اختيارية"
                />
              </div>
            </div>

            <Button onClick={handleAddSpecialPrice} disabled={isLoading} className="mt-3">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
              إضافة
            </Button>
          </div>

          {/* Existing special prices */}
          <div>
            <h4 className="font-medium mb-3">الأسعار الخاصة الحالية ({specialPrices.length})</h4>
            {specialPrices.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">لا توجد أسعار خاصة لهذا العميل</p>
            ) : (
              <div className="space-y-2">
                {specialPrices.map(sp => (
                  <div key={sp.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <span className="font-medium">{sp.product?.name}</span>
                      <span className="text-muted-foreground mx-2">-</span>
                      <span className="text-primary font-bold">
                        {sp.price_type === 'fixed' 
                          ? `${sp.special_price} دج`
                          : `خصم ${sp.special_price}%`
                        }
                      </span>
                      {sp.notes && (
                        <span className="text-xs text-muted-foreground block">{sp.notes}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSpecialPrice(sp.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerSpecialPricesDialog;
