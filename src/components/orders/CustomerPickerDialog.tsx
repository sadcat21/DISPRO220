import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, User, MapPin, Phone, Loader2 } from 'lucide-react';
import { Customer } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface CustomerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  isLoading?: boolean;
  selectedCustomerId?: string;
  onSelect: (customer: Customer) => void;
  onAddNew?: () => void;
}

const CustomerPickerDialog: React.FC<CustomerPickerDialogProps> = ({
  open,
  onOpenChange,
  customers,
  isLoading,
  selectedCustomerId,
  onSelect,
  onAddNew,
}) => {
  const { t, dir } = useLanguage();
  const [search, setSearch] = useState('');

  // Reset search when dialog opens
  React.useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.store_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.wilaya?.toLowerCase().includes(q) ||
      c.internal_name?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto max-h-[85vh] p-0 gap-0" dir={dir}>
        <DialogHeader className="p-3 pb-2 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base">
              <User className="w-5 h-5 text-primary" />
              {t('orders.select_customer')}
            </span>
            {onAddNew && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-primary hover:text-primary gap-1"
                onClick={() => {
                  onAddNew();
                }}
              >
                <UserPlus className="w-4 h-4" />
                {t('orders.new_customer')}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم، الهاتف، الولاية..."
              className="pr-9 h-10"
              autoFocus
            />
          </div>
        </div>

        {/* Customer count */}
        <div className="px-3 py-1">
          <p className="text-xs text-muted-foreground">
            {filteredCustomers.length} عميل {search && `من ${customers.length}`}
          </p>
        </div>

        {/* Customers List */}
        <ScrollArea className="max-h-[55vh] px-1">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-10 text-center">
              <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">
                {search ? 'لا يوجد عميل مطابق' : t('orders.no_customers')}
              </p>
              {search && onAddNew && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1"
                  onClick={onAddNew}
                >
                  <UserPlus className="w-4 h-4" />
                  إضافة عميل جديد
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {filteredCustomers.map((customer) => {
                const isSelected = selectedCustomerId === customer.id;
                return (
                  <button
                    key={customer.id}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-lg text-right transition-colors",
                      "hover:bg-accent/50 active:bg-accent",
                      isSelected && "bg-primary/10 ring-1 ring-primary/30"
                    )}
                    onClick={() => {
                      onSelect(customer);
                      onOpenChange(false);
                    }}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {customer.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{customer.name}</p>
                      {customer.store_name && (
                        <p className="text-xs text-muted-foreground truncate">{customer.store_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {customer.wilaya && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />
                            {customer.wilaya}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" dir="ltr">
                            <Phone className="w-2.5 h-2.5" />
                            {customer.phone}
                          </span>
                        )}
                        {customer.default_payment_type && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                            {customer.default_payment_type === 'with_invoice' ? 'فاتورة 1' :
                              customer.default_price_subtype === 'super_gros' ? 'سوبر غرو' :
                                customer.default_price_subtype === 'retail' ? 'تجزئة' : 'غرو'
                            }
                          </Badge>
                        )}
                        {customer.is_trusted && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-green-50 text-green-700 border-green-200">
                            موثوق
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerPickerDialog;
