import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CustomerPickerDialog from './CustomerPickerDialog';
import {
    ShoppingCart, Banknote, Truck, Ban, Loader2
} from 'lucide-react';
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
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    useEffect(() => {
        if (open) {
            fetchCustomers();
        } else {
            setSelectedCustomer(null);
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
            case 'order': onOrder?.(selectedCustomer); break;
            case 'sale': onSale?.(selectedCustomer); break;
            case 'delivery': onDelivery?.(selectedCustomer); break;
            case 'visit': onVisitOnly?.(selectedCustomer); break;
        }
        onOpenChange(false);
    };

    // If no customer selected yet, show the picker directly
    if (open && !selectedCustomer) {
        return (
            <CustomerPickerDialog
                open={open}
                onOpenChange={onOpenChange}
                customers={customers}
                isLoading={isLoading}
                onSelect={(customer) => setSelectedCustomer(customer)}
            />
        );
    }

    // Once customer is selected, show action buttons
    return (
        <Dialog open={open && !!selectedCustomer} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md" dir={dir}>
                <div className="space-y-4 py-2">
                    {/* Selected customer info */}
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                            {selectedCustomer?.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">{selectedCustomer?.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {[selectedCustomer?.store_name, selectedCustomer?.phone].filter(Boolean).join(' • ')}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setSelectedCustomer(null)}
                        >
                            تغيير
                        </Button>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-1 gap-3">
                        {allowedActions.includes('order') && (
                            <Button onClick={() => handleAction('order')} className="h-14 text-lg gap-3" variant="default">
                                <ShoppingCart className="w-6 h-6" />
                                {t('orders.new')}
                            </Button>
                        )}
                        {allowedActions.includes('sale') && (
                            <Button onClick={() => handleAction('sale')} className="h-14 text-lg gap-3 bg-green-600 hover:bg-green-700 text-white" variant="outline">
                                <Banknote className="w-6 h-6" />
                                {t('stock.direct_sale')}
                            </Button>
                        )}
                        {allowedActions.includes('delivery') && (
                            <Button onClick={() => handleAction('delivery')} className="h-14 text-lg gap-3 bg-blue-600 hover:bg-blue-700 text-white" variant="outline">
                                <Truck className="w-6 h-6" />
                                {t('deliveries.start_delivery')}
                            </Button>
                        )}
                        {allowedActions.includes('visit') && (
                            <Button onClick={() => handleAction('visit')} className="h-14 text-lg gap-3" variant="secondary">
                                <Ban className="w-6 h-6" />
                                {t('common.visit_only')}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CustomerActionDialog;
