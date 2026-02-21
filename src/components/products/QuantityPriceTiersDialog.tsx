import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Layers } from 'lucide-react';
import { Product } from '@/types/database';

interface QuantityPriceTiersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

interface PriceTier {
  id: string;
  min_quantity: number;
  max_quantity: number | null;
  tier_price: number;
  price_type: string;
  notes: string | null;
}

const QuantityPriceTiersDialog: React.FC<QuantityPriceTiersDialogProps> = ({
  open,
  onOpenChange,
  product
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [newTier, setNewTier] = useState({
    min_quantity: '',
    max_quantity: '',
    tier_price: '',
    price_type: 'unit_price',
    notes: ''
  });

  // Fetch price tiers
  const { data: tiers = [], refetch } = useQuery({
    queryKey: ['quantity-price-tiers', product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data, error } = await supabase
        .from('quantity_price_tiers')
        .select('*')
        .eq('product_id', product.id)
        .order('min_quantity');
      if (error) throw error;
      return data as PriceTier[];
    },
    enabled: !!product?.id && open
  });

  const handleAddTier = async () => {
    if (!product?.id || !newTier.min_quantity || !newTier.tier_price) {
      toast({ title: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quantity_price_tiers')
        .upsert({
          product_id: product.id,
          min_quantity: parseInt(newTier.min_quantity),
          max_quantity: newTier.max_quantity ? parseInt(newTier.max_quantity) : null,
          tier_price: parseFloat(newTier.tier_price),
          price_type: newTier.price_type,
          notes: newTier.notes || null
        }, {
          onConflict: 'product_id,min_quantity'
        });

      if (error) throw error;

      toast({ title: 'تم إضافة شريحة السعر بنجاح' });
      setNewTier({ min_quantity: '', max_quantity: '', tier_price: '', price_type: 'unit_price', notes: '' });
      refetch();
    } catch (error: any) {
      toast({ title: 'خطأ في إضافة الشريحة', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTier = async (id: string) => {
    try {
      const { error } = await supabase
        .from('quantity_price_tiers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'تم حذف شريحة السعر' });
      refetch();
    } catch (error: any) {
      toast({ title: 'خطأ في الحذف', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            شرائح الأسعار بالكمية - {product?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new tier */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <h4 className="font-medium mb-3">إضافة شريحة سعر جديدة</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>الحد الأدنى للكمية</Label>
                <Input
                  type="number"
                  value={newTier.min_quantity}
                  onChange={(e) => setNewTier(p => ({ ...p, min_quantity: e.target.value }))}
                  placeholder="مثال: 10"
                />
              </div>

              <div>
                <Label>الحد الأقصى للكمية (اختياري)</Label>
                <Input
                  type="number"
                  value={newTier.max_quantity}
                  onChange={(e) => setNewTier(p => ({ ...p, max_quantity: e.target.value }))}
                  placeholder="اتركه فارغاً لعدم التحديد"
                />
              </div>

              <div>
                <Label>نوع السعر</Label>
                <Select value={newTier.price_type} onValueChange={(v) => setNewTier(p => ({ ...p, price_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unit_price">سعر الوحدة</SelectItem>
                    <SelectItem value="discount_percent">نسبة خصم %</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{newTier.price_type === 'unit_price' ? 'سعر الوحدة (دج)' : 'نسبة الخصم %'}</Label>
                <Input
                  type="number"
                  value={newTier.tier_price}
                  onChange={(e) => setNewTier(p => ({ ...p, tier_price: e.target.value }))}
                  placeholder={newTier.price_type === 'unit_price' ? '0.00' : '10'}
                />
              </div>

              <div className="md:col-span-2">
                <Label>ملاحظات</Label>
                <Input
                  value={newTier.notes}
                  onChange={(e) => setNewTier(p => ({ ...p, notes: e.target.value }))}
                  placeholder="ملاحظات اختيارية"
                />
              </div>
            </div>

            <Button onClick={handleAddTier} disabled={isLoading} className="mt-3">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
              إضافة
            </Button>
          </div>

          {/* Existing tiers */}
          <div>
            <h4 className="font-medium mb-3">شرائح الأسعار الحالية ({tiers.length})</h4>
            {tiers.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">لا توجد شرائح أسعار لهذا المنتج</p>
            ) : (
              <div className="space-y-2">
                {tiers.map(tier => (
                  <div key={tier.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <span className="font-medium">
                        من {tier.min_quantity} {tier.max_quantity ? `إلى ${tier.max_quantity}` : 'فما فوق'}
                      </span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="text-primary font-bold">
                        {tier.price_type === 'unit_price'
                          ? `${tier.tier_price} دج/وحدة`
                          : `خصم ${tier.tier_price}%`
                        }
                      </span>
                      {tier.notes && (
                        <span className="text-xs text-muted-foreground block">{tier.notes}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTier(tier.id)}
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

export default QuantityPriceTiersDialog;
