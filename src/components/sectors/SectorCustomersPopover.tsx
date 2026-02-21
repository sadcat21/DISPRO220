import React, { useMemo } from 'react';
import { MapPin, User, Truck, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DAY_NAMES: Record<string, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الإثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
};

const JS_DAY_TO_NAME: Record<number, string> = {
  6: 'saturday',
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
};

const SectorCustomersPopover: React.FC = () => {
  const { t } = useLanguage();
  const { workerId, activeBranch } = useAuth();
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors-with-customers', workerId, activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('sectors').select('*');
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['sector-customers', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('customers').select('id, name, phone, wilaya, sector_id, store_name').not('sector_id', 'is', null);
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId,
  });

  // Get sectors where this worker is assigned for delivery or sales today
  const mySectors = useMemo(() => {
    return sectors.filter(s => 
      s.delivery_worker_id === workerId || s.sales_worker_id === workerId
    );
  }, [sectors, workerId]);

  const todayDeliverySectors = useMemo(() => {
    return mySectors.filter(s => s.visit_day_delivery === todayName && s.delivery_worker_id === workerId);
  }, [mySectors, todayName, workerId]);

  const todaySalesSectors = useMemo(() => {
    return mySectors.filter(s => s.visit_day_sales === todayName && s.sales_worker_id === workerId);
  }, [mySectors, todayName, workerId]);

  const deliveryCustomers = useMemo(() => {
    const sectorIds = new Set(todayDeliverySectors.map(s => s.id));
    return customers.filter(c => c.sector_id && sectorIds.has(c.sector_id));
  }, [customers, todayDeliverySectors]);

  const salesCustomers = useMemo(() => {
    const sectorIds = new Set(todaySalesSectors.map(s => s.id));
    return customers.filter(c => c.sector_id && sectorIds.has(c.sector_id));
  }, [customers, todaySalesSectors]);

  const totalCount = deliveryCustomers.length + salesCustomers.length;

  if (mySectors.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
          title="عملاء اليوم"
        >
          <MapPin className="w-4 h-4 text-blue-500" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-[70vh] flex flex-col">
        <div className="p-3 border-b font-bold text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          عملاء اليوم — {DAY_NAMES[todayName] || todayName}
        </div>

        <Tabs defaultValue="delivery" className="flex flex-col h-full">
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="delivery" className="flex-1 gap-1 text-xs">
              <Truck className="w-3.5 h-3.5" />
              توصيل
              {deliveryCustomers.length > 0 && <Badge variant="secondary" className="text-[10px] px-1">{deliveryCustomers.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex-1 gap-1 text-xs">
              <ShoppingCart className="w-3.5 h-3.5" />
              طلبات
              {salesCustomers.length > 0 && <Badge variant="secondary" className="text-[10px] px-1">{salesCustomers.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="delivery" className="m-0 flex-1">
            <CustomerList customers={deliveryCustomers} emptyMessage="لا توجد عمليات توصيل اليوم" />
          </TabsContent>
          <TabsContent value="sales" className="m-0 flex-1">
            <CustomerList customers={salesCustomers} emptyMessage="لا توجد طلبات لجمعها اليوم" />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

const CustomerList: React.FC<{ customers: any[]; emptyMessage: string }> = ({ customers, emptyMessage }) => {
  if (customers.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="divide-y">
        {customers.map(c => (
          <div key={c.id} className="p-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{c.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {c.store_name && <span>{c.store_name}</span>}
                  {c.phone && <span>• {c.phone}</span>}
                  {c.wilaya && <span>• {c.wilaya}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default SectorCustomersPopover;
