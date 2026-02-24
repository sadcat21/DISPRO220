import React, { useMemo, useState } from 'react';
import { MapPin, User, Truck, ShoppingCart, MapPinOff, Navigation, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { toast } from 'sonner';
import { useLocationThreshold } from '@/hooks/useLocationSettings';
import { useHasPermission } from '@/hooks/usePermissions';
import { calculateDistance } from '@/utils/geoUtils';

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
  const navigate = useNavigate();
  const { trackVisit } = useTrackVisit();
  const { data: locationThreshold } = useLocationThreshold();
  const canBypassLocation = useHasPermission('bypass_location_check');
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const [isOpen, setIsOpen] = useState(false);
  const [checkingLocationFor, setCheckingLocationFor] = useState<string | null>(null);

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
      let query = supabase.from('customers').select('id, name, phone, wilaya, sector_id, store_name, latitude, longitude').not('sector_id', 'is', null);
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId,
  });

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

  const handleCustomerClick = (customer: any, tab: 'delivery' | 'sales') => {
    setIsOpen(false);
    if (tab === 'sales') {
      // Navigate to create order for this customer
      navigate('/orders', { state: { customerId: customer.id } });
    }
  };

  const checkLocationBeforeAction = async (customer: any): Promise<boolean> => {
    if (canBypassLocation) return true;
    if (!customer.latitude || !customer.longitude) return true;

    const threshold = locationThreshold ?? 100;
    setCheckingLocationFor(customer.id);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(); return; }
        navigator.geolocation.getCurrentPosition(resolve, () => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
      });
      const distanceKm = calculateDistance(position.coords.latitude, position.coords.longitude, customer.latitude, customer.longitude);
      const distanceMeters = distanceKm * 1000;
      if (distanceMeters > threshold) {
        toast.error(`أنت بعيد عن موقع العميل (${Math.round(distanceMeters)} متر). يجب أن تكون على بُعد ${threshold} متر أو أقل.`);
        return false;
      }
      return true;
    } catch {
      toast.error('تعذر تحديد موقعك. يرجى تفعيل خدمة الموقع.');
      return false;
    } finally {
      setCheckingLocationFor(null);
    }
  };

  const handleVisitWithoutOrder = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({
        customerId: customer.id,
        operationType: 'visit',
        notes: `زيارة بدون طلبية - ${customer.name}`,
      });
      toast.success(`تم تسجيل زيارة ${customer.name} بنجاح`);
    } catch {
      toast.error('فشل في تسجيل الزيارة');
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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

        <Tabs defaultValue="delivery" className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full rounded-none border-b shrink-0">
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
          <TabsContent value="delivery" className="m-0 flex-1 overflow-hidden">
            <CustomerList
              customers={deliveryCustomers}
              emptyMessage="لا توجد عمليات توصيل اليوم"
              onCustomerClick={(c) => handleCustomerClick(c, 'delivery')}
              onVisitWithoutOrder={handleVisitWithoutOrder}
              showVisitButton={false}
              checkingLocationFor={checkingLocationFor}
            />
          </TabsContent>
          <TabsContent value="sales" className="m-0 flex-1 overflow-hidden">
            <CustomerList
              customers={salesCustomers}
              emptyMessage="لا توجد طلبات لجمعها اليوم"
              onCustomerClick={(c) => handleCustomerClick(c, 'sales')}
              onVisitWithoutOrder={handleVisitWithoutOrder}
              showVisitButton={true}
              checkingLocationFor={checkingLocationFor}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

const CustomerList: React.FC<{
  customers: any[];
  emptyMessage: string;
  onCustomerClick: (c: any) => void;
  onVisitWithoutOrder: (c: any) => void;
  showVisitButton: boolean;
  checkingLocationFor: string | null;
}> = ({ customers, emptyMessage, onCustomerClick, onVisitWithoutOrder, showVisitButton, checkingLocationFor }) => {
  if (customers.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="divide-y">
        {customers.map(c => (
          <div key={c.id} className="p-3 hover:bg-muted/50 transition-colors">
            <button
              className="w-full flex items-center gap-2 text-start"
              onClick={() => onCustomerClick(c)}
            >
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
            </button>
            {/* Action buttons */}
            <div className="flex items-center gap-1 mt-1.5 justify-end">
              {c.latitude && c.longitude && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-1.5 gap-0.5"
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`, '_blank')}
                >
                  <Navigation className="w-3 h-3" />
                  الموقع
                </Button>
              )}
              {showVisitButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-1.5 gap-0.5 text-orange-600"
                  onClick={() => onVisitWithoutOrder(c)}
                  disabled={checkingLocationFor === c.id}
                >
                  {checkingLocationFor === c.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <MapPinOff className="w-3 h-3" />
                  )}
                  زيارة بدون طلبية
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default SectorCustomersPopover;
