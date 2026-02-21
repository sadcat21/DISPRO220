import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    User, Check, ChevronsUpDown, ShoppingCart,
    Banknote, Truck, Ban, Loader2, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/database';
import { toast } from 'sonner';

interface CustomerActionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOrder?: (customer: Customer) => void;
    onSale?: (customer: Customer) => void;
    onDelivery?: (customer: Customer) => void;
    onVisitOnly?: (customer: Customer) => void;
    allowedActions?: ('order' | 'sale' | 'delivery' | 'visit')[];
}

const CustomerActionDialog: React.FC<CustomerActionDialogProps> = ({
    open,
    onOpenChange,
    onOrder,
    onSale,
    onDelivery,
    onVisitOnly,
    allowedActions = ['order', 'sale', 'delivery', 'visit']
}) => {
    const { t, dir } = useLanguage();
    const { activeBranch } = useAuth();

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

    const selectedCustomer = useMemo(() =>
        customers.find(c => c.id === selectedCustomerId),
        [customers, selectedCustomerId]
    );

    useEffect(() => {
        if (open) {
            fetchCustomers();
        } else {
            setSelectedCustomerId('');
        }
    }, [open, activeBranch]);

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('customers').select('*').order('name');
            if (activeBranch) {
                query = query.eq('branch_id', activeBranch.id);
            }
            const { data, error } = await query;
            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
            toast.error(t('orders.fetch_error'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = (action: 'order' | 'sale' | 'delivery' | 'visit') => {
        if (!selectedCustomer) return;

        switch (action) {
            case 'order':
                onOrder?.(selectedCustomer);
                break;
            case 'sale':
                onSale?.(selectedCustomer);
                break;
            case 'delivery':
                onDelivery?.(selectedCustomer);
                break;
            case 'visit':
                onVisitOnly?.(selectedCustomer);
                break;
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md" dir={dir}>
                <DialogHeader>
                    <DialogTitle>{t('orders.select_customer')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Popover open={customerDropdownOpen} onOpenChange={setCustomerDropdownOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={customerDropdownOpen}
                                    className="w-full justify-between h-12 text-lg"
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <User className="w-5 h-5 opacity-50 shrink-0" />
                                        <span className="truncate">
                                            {selectedCustomer ? selectedCustomer.name : t('orders.select_customer')}
                                        </span>
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                <Command className="w-full">
                                    <CommandInput placeholder={t('orders.search_customer')} className="h-12" />
                                    <CommandList className="max-h-[300px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                        <CommandEmpty>
                                            {isLoading ? (
                                                <div className="flex items-center justify-center py-6">
                                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                </div>
                                            ) : (
                                                t('orders.no_customers')
                                            )}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {customers.map((customer) => (
                                                <CommandItem
                                                    key={customer.id}
                                                    value={customer.name}
                                                    onSelect={() => {
                                                        setSelectedCustomerId(customer.id);
                                                        setCustomerDropdownOpen(false);
                                                    }}
                                                    className="flex items-center justify-between py-3 cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <User className="w-4 h-4 opacity-50" />
                                                        <span>{customer.name}</span>
                                                    </div>
                                                    {selectedCustomerId === customer.id && (
                                                        <Check className="h-4 w-4 text-primary" />
                                                    )}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {selectedCustomer && (
                        <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                            {allowedActions.includes('order') && (
                                <Button
                                    onClick={() => handleAction('order')}
                                    className="h-14 text-lg gap-3"
                                    variant="default"
                                >
                                    <ShoppingCart className="w-6 h-6" />
                                    {t('orders.new')}
                                </Button>
                            )}

                            {allowedActions.includes('sale') && (
                                <Button
                                    onClick={() => handleAction('sale')}
                                    className="h-14 text-lg gap-3 bg-green-600 hover:bg-green-700 text-white"
                                    variant="outline"
                                >
                                    <Banknote className="w-6 h-6" />
                                    {t('stock.direct_sale')}
                                </Button>
                            )}

                            {allowedActions.includes('delivery') && (
                                <Button
                                    onClick={() => handleAction('delivery')}
                                    className="h-14 text-lg gap-3 bg-blue-600 hover:bg-blue-700 text-white"
                                    variant="outline"
                                >
                                    <Truck className="w-6 h-6" />
                                    {t('deliveries.start_delivery')}
                                </Button>
                            )}

                            {allowedActions.includes('visit') && (
                                <Button
                                    onClick={() => handleAction('visit')}
                                    className="h-14 text-lg gap-3"
                                    variant="secondary"
                                >
                                    <Ban className="w-6 h-6" />
                                    {t('common.visit_only')}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CustomerActionDialog;
