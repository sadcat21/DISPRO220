import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Minus, User, Package, Loader2, Gift, Check, ChevronsUpDown } from 'lucide-react';
import { Product, Customer } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import AddCustomerDialog from './AddCustomerDialog';
import { cn, isAdminRole } from '@/lib/utils';
interface AddPromoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
}

const AddPromoDialog: React.FC<AddPromoDialogProps> = ({
  open,
  onOpenChange,
  product,
  onSuccess,
}) => {
  const { workerId, role, activeBranch } = useAuth();
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [venteQuantity, setVenteQuantity] = useState(1);
  const [gratuiteQuantity, setGratuiteQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [hasBonus, setHasBonus] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const isAdmin = isAdminRole(role);
  const isBranchAdmin = role === 'branch_admin';
  const canSetBonus = isAdmin || isBranchAdmin;
  
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  useEffect(() => {
    if (open) {
      fetchCustomers();
      setVenteQuantity(1);
      setGratuiteQuantity(0);
      setNotes('');
      setSelectedCustomerId('');
      setHasBonus(false);
      setBonusAmount('');
    }
  }, [open]);

  const fetchCustomers = async () => {
    setIsLoadingCustomers(true);
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .order('name');
      
      // Filter by active branch if admin has selected one
      if (isAdmin && activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('فشل تحميل قائمة العملاء');
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      toast.error(t('promos.select_customer'));
      return;
    }

    if (!workerId || !product) {
      toast.error('خطأ في البيانات');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('promos').insert({
        worker_id: workerId,
        customer_id: selectedCustomerId,
        product_id: product.id,
        vente_quantity: venteQuantity,
        gratuite_quantity: gratuiteQuantity,
        notes: notes.trim() || null,
        has_bonus: hasBonus,
        bonus_amount: hasBonus ? parseInt(bonusAmount) || 0 : 0,
      });

      if (error) throw error;

      const bonusText = hasBonus && bonusAmount ? ` + ${t('promos.has_bonus')} ${bonusAmount} ${t('currency.dzd')}` : '';
      toast.success(`تم تسجيل ${venteQuantity} ${t('promos.sales')} + ${gratuiteQuantity} ${t('promos.free')} من ${product.name}${bonusText}`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding promo:', error);
      toast.error(error.message || 'فشل تسجيل البرومو');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomerAdded = (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedCustomerId(newCustomer.id);
    setShowAddCustomer(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto p-0 gap-0 border-0">
          {/* Header with gradient */}
          <div className="bg-gradient-to-l from-primary to-primary/90 text-primary-foreground p-5 rounded-t-lg">
            <DialogTitle className="flex items-center justify-center gap-3 text-xl font-bold">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              {product?.name}
            </DialogTitle>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-6">
            {/* Customer Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <User className="w-4 h-4 text-secondary-foreground" />
                </div>
                {t('nav.customers')}
              </Label>
              {isLoadingCustomers ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="flex gap-2">
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        className={cn(
                          "flex-1 justify-between font-normal h-12 text-base border-2 transition-colors",
                          selectedCustomer 
                            ? "border-primary/30 bg-primary/5" 
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {selectedCustomer ? (
                          <span className="font-medium">{selectedCustomer.name}</span>
                        ) : (
                          <span className="text-muted-foreground">{t('promos.select_customer')}</span>
                        )}
                        <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t('common.search')} className="text-right h-12" dir="rtl" />
                        <CommandList className="max-h-60">
                          <CommandEmpty>{t('customers.no_customers')}</CommandEmpty>
                          <CommandGroup>
                            {customers.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.name}
                                onSelect={() => {
                                  setSelectedCustomerId(customer.id);
                                  setCustomerSearchOpen(false);
                                }}
                                className="text-right py-3"
                                dir="rtl"
                              >
                                <Check
                                  className={cn(
                                    "me-2 h-4 w-4 text-primary",
                                    selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="font-medium">{customer.name}</span>
                                {customer.wilaya && (
                                  <span className="text-muted-foreground text-xs me-auto">
                                    {customer.wilaya}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => setShowAddCustomer(true)}
                    className="shrink-0 h-12 w-12"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Quantities Section */}
            <div className="grid grid-cols-2 gap-4">
              {/* Vente Quantity */}
              <div className="space-y-3">
                <Label className="text-center block text-sm font-semibold text-muted-foreground">
                  {t('promos.sales_quantity')}
                </Label>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-20 h-20 flex items-center justify-center bg-secondary rounded-2xl border-2 border-secondary shadow-inner">
                    <span className="text-4xl font-bold text-secondary-foreground">{venteQuantity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setVenteQuantity(Math.max(0, venteQuantity - 1))}
                      disabled={venteQuantity <= 0}
                      className="h-9 w-9 rounded-full border-2 hover:bg-secondary hover:text-secondary-foreground"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setVenteQuantity(venteQuantity + 1)}
                      className="h-9 w-9 rounded-full border-2 hover:bg-secondary hover:text-secondary-foreground"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Gratuite Quantity */}
              <div className="space-y-3">
                <Label className="text-center block text-sm font-semibold text-muted-foreground">
                  {t('promos.free_quantity')}
                </Label>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-20 h-20 flex items-center justify-center bg-emerald-500/10 rounded-2xl border-2 border-emerald-500/30 shadow-inner">
                    <span className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{gratuiteQuantity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setGratuiteQuantity(Math.max(0, gratuiteQuantity - 1))}
                      disabled={gratuiteQuantity <= 0}
                      className="h-9 w-9 rounded-full border-2 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setGratuiteQuantity(gratuiteQuantity + 1)}
                      className="h-9 w-9 rounded-full border-2 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Only: Bonus Section */}
            {canSetBonus && (
              <div className="space-y-3 p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-500/20">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 font-semibold">
                    <Gift className="w-5 h-5 text-amber-600" />
                    {t('promos.has_bonus')}
                  </Label>
                  <Switch
                    checked={hasBonus}
                    onCheckedChange={setHasBonus}
                  />
                </div>
                
                {hasBonus && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm">{t('promos.bonus_amount')}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={bonusAmount}
                        onChange={(e) => setBonusAmount(e.target.value)}
                        placeholder={t('promos.bonus_placeholder')}
                        className="text-right pe-12 h-12 text-lg font-semibold border-2 border-amber-500/30 focus:border-amber-500"
                        min="0"
                      />
                      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-amber-600 font-medium">
                        {t('currency.dzd')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                {t('common.notes')} ({t('common.optional')})
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={`${t('common.add')} ${t('common.notes')}...`}
                className="resize-none border-2 focus:border-primary/50 min-h-[60px]"
                rows={2}
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
              disabled={isLoading || !selectedCustomerId || (venteQuantity === 0 && gratuiteQuantity === 0)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 ms-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Package className="w-5 h-5 ms-2" />
                  {t('promos.add')}
                </>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AddCustomerDialog
        open={showAddCustomer}
        onOpenChange={setShowAddCustomer}
        onSuccess={handleCustomerAdded}
      />
    </>
  );
};

export default AddPromoDialog;