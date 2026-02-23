import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Search, UserPlus, User, ChevronLeft, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { Customer, Sector } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface CustomerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  sectors?: Sector[];
  isLoading?: boolean;
  selectedCustomerId?: string;
  onSelect: (customer: Customer) => void;
  onAddNew?: () => void;
}

interface SectorGroup {
  sectorId: string | null;
  sectorName: string;
  customers: Customer[];
}

const CustomerPickerDialog: React.FC<CustomerPickerDialogProps> = ({
  open,
  onOpenChange,
  customers,
  sectors = [],
  isLoading,
  selectedCustomerId,
  onSelect,
  onAddNew,
}) => {
  const { t, dir } = useLanguage();
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  React.useEffect(() => {
    if (open) {
      setSearch('');
      setOpenGroups(new Set());
    }
  }, [open]);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.name_fr?.toLowerCase().includes(q) ||
      c.store_name?.toLowerCase().includes(q) ||
      (c as any).store_name_fr?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.wilaya?.toLowerCase().includes(q) ||
      c.internal_name?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  // Build sector map for quick lookup
  const sectorMap = useMemo(() => {
    const map = new Map<string, string>();
    sectors.forEach(s => map.set(s.id, s.name));
    return map;
  }, [sectors]);

  // Group customers by sector
  const groupedCustomers = useMemo((): SectorGroup[] => {
    const groups = new Map<string | null, Customer[]>();
    
    filteredCustomers.forEach(c => {
      const key = c.sector_id || null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });

    const result: SectorGroup[] = [];
    
    // Add sectors with customers first (ordered by sector name)
    const sectorIds = Array.from(groups.keys()).filter(k => k !== null) as string[];
    sectorIds.sort((a, b) => {
      const nameA = sectorMap.get(a) || '';
      const nameB = sectorMap.get(b) || '';
      return nameA.localeCompare(nameB, 'ar');
    });

    sectorIds.forEach(sid => {
      result.push({
        sectorId: sid,
        sectorName: sectorMap.get(sid) || 'غير معروف',
        customers: groups.get(sid)!,
      });
    });

    // Add "no sector" group at the end
    if (groups.has(null) && groups.get(null)!.length > 0) {
      result.push({
        sectorId: null,
        sectorName: 'بدون سكتور',
        customers: groups.get(null)!,
      });
    }

    return result;
  }, [filteredCustomers, sectorMap]);

  const getSectorName = (sectorId: string | null | undefined) => {
    if (!sectorId) return '';
    return sectorMap.get(sectorId) || '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] p-0 gap-0 rounded-2xl" dir={dir}>
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="text-center text-base font-bold">
            اختر عميل...
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 left-4 text-destructive hover:text-destructive/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم، المحل، أو الهاتف..."
              className="pr-10 h-11 rounded-full border-2 border-primary/30 focus:border-primary text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Customers List */}
        <ScrollArea className="max-h-[60vh]">
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
            <div>
              {groupedCustomers.map((group) => {
                const groupKey = group.sectorId || 'no-sector';
                const isOpen = search.trim() ? true : openGroups.has(groupKey);
                return (
                  <Collapsible key={groupKey} open={isOpen} onOpenChange={() => toggleGroup(groupKey)}>
                    {/* Sector header */}
                    <CollapsibleTrigger asChild>
                      <button className="sticky top-0 z-10 w-full bg-muted/80 backdrop-blur-sm px-4 py-2 border-b border-t flex items-center justify-between">
                        <p className="text-xs font-bold text-primary">
                          {group.sectorName} ({group.customers.length})
                        </p>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </CollapsibleTrigger>
                    {/* Customers in this sector */}
                    <CollapsibleContent>
                      <div className="divide-y divide-border">
                        {group.customers.map((customer) => {
                          const isSelected = selectedCustomerId === customer.id;
                          const subtitle = [customer.store_name, customer.phone].filter(Boolean).join(' • ');
                          return (
                            <button
                              key={customer.id}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 text-right transition-colors",
                                "hover:bg-accent/50 active:bg-accent",
                                isSelected && "bg-primary/5"
                              )}
                              onClick={() => {
                                onSelect(customer);
                                onOpenChange(false);
                              }}
                            >
                              <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0 text-right">
                                <p className="font-bold text-sm truncate">{customer.name}</p>
                                {subtitle && (
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
                                )}
                              </div>
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                              )}>
                                <User className="w-5 h-5" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {filteredCustomers.length} عميل
          </p>
          {onAddNew && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-primary hover:text-primary gap-1"
              onClick={onAddNew}
            >
              <UserPlus className="w-4 h-4" />
              عميل جديد
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerPickerDialog;
