import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Stamp, Loader2, DollarSign, Percent } from 'lucide-react';
import { toast } from 'sonner';

interface StampPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type StampType = 'value' | 'percentage';

const StampPriceDialog: React.FC<StampPriceDialogProps> = ({ open, onOpenChange }) => {
  const [stampPrice, setStampPrice] = useState<string>('');
  const [stampType, setStampType] = useState<StampType>('value');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingPriceId, setExistingPriceId] = useState<string | null>(null);
  const [existingTypeId, setExistingTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchStampPrice();
    }
  }, [open]);

  const fetchStampPrice = async () => {
    setIsLoading(true);
    try {
      const [priceRes, typeRes] = await Promise.all([
        supabase
          .from('settings')
          .select('*')
          .eq('key', 'stamp_price')
          .is('branch_id', null)
          .maybeSingle(),
        supabase
          .from('settings')
          .select('*')
          .eq('key', 'stamp_type')
          .is('branch_id', null)
          .maybeSingle(),
      ]);

      if (priceRes.error) throw priceRes.error;
      if (typeRes.error) throw typeRes.error;
      
      if (priceRes.data) {
        setStampPrice(priceRes.data.value.toString());
        setExistingPriceId(priceRes.data.id);
      } else {
        setStampPrice('');
        setExistingPriceId(null);
      }

      if (typeRes.data) {
        // value stored as 0 = 'value', 1 = 'percentage'
        setStampType(typeRes.data.value === 1 ? 'percentage' : 'value');
        setExistingTypeId(typeRes.data.id);
      } else {
        setStampType('value');
        setExistingTypeId(null);
      }
    } catch (error) {
      console.error('Error fetching stamp price:', error);
      toast.error('فشل تحميل سعر الطابع');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const price = parseFloat(stampPrice);
    if (isNaN(price) || price < 0) {
      toast.error('الرجاء إدخال قيمة صحيحة');
      return;
    }

    if (stampType === 'percentage' && price > 100) {
      toast.error('النسبة يجب أن تكون بين 0 و 100');
      return;
    }

    setIsSaving(true);
    try {
      // Save price
      if (existingPriceId) {
        const { error } = await supabase
          .from('settings')
          .update({ value: price })
          .eq('id', existingPriceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert({ key: 'stamp_price', value: price, branch_id: null });
        if (error) throw error;
      }

      // Save type (0 = value, 1 = percentage)
      const typeValue = stampType === 'percentage' ? 1 : 0;
      if (existingTypeId) {
        const { error } = await supabase
          .from('settings')
          .update({ value: typeValue })
          .eq('id', existingTypeId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert({ key: 'stamp_type', value: typeValue, branch_id: null });
        if (error) throw error;
      }

      toast.success('تم حفظ إعدادات الطابع بنجاح');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving stamp settings:', error);
      toast.error(error.message || 'فشل حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stamp className="w-5 h-5" />
            سعر الطابع الجبائي
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Type Selection */}
            <div className="space-y-3">
              <Label>نوع الطابع</Label>
              <RadioGroup 
                value={stampType} 
                onValueChange={(val) => setStampType(val as StampType)}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="type-value"
                  className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    stampType === 'value' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value="value" id="type-value" />
                  <DollarSign className="w-4 h-4" />
                  <span>قيمة ثابتة</span>
                </Label>
                <Label
                  htmlFor="type-percentage"
                  className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    stampType === 'percentage' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value="percentage" id="type-percentage" />
                  <Percent className="w-4 h-4" />
                  <span>نسبة مئوية</span>
                </Label>
              </RadioGroup>
            </div>

            {/* Value Input */}
            <div className="space-y-2">
              <Label>
                {stampType === 'value' ? 'سعر الطابع (دج)' : 'نسبة الطابع (%)'}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={stampType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  value={stampPrice}
                  onChange={(e) => setStampPrice(e.target.value)}
                  placeholder={stampType === 'value' ? '0.00' : '0'}
                  className="text-right pl-12"
                  autoFocus
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {stampType === 'value' ? 'دج' : '%'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {stampType === 'value' 
                  ? 'يظهر هذا المبلغ كتذكير عند اختيار طريقة الدفع "بفاتورة"'
                  : 'يتم حساب مبلغ الطابع كنسبة من إجمالي الطلبية'
                }
              </p>
            </div>
            
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                'حفظ'
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StampPriceDialog;
