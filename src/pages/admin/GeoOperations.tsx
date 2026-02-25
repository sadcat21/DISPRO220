import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Loader2, Navigation, Clock, User, ShoppingCart, Truck, UserPlus, CreditCard, Filter, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useVisitTrackingList, getOperationLabel, OperationType } from '@/hooks/useVisitTracking';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { calculateDistance, formatDistance, reverseGeocode } from '@/utils/geoUtils';
import CustomerLocationView from '@/components/map/CustomerLocationView';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const OPERATION_ICONS: Record<string, React.ElementType> = {
  order: ShoppingCart,
  direct_sale: Truck,
  delivery: Navigation,
  add_customer: UserPlus,
  update_customer: Pencil,
  delete_customer: Trash2,
  debt_collection: CreditCard,
};

const OPERATION_COLORS: Record<string, string> = {
  order: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  direct_sale: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  delivery: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  add_customer: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  update_customer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  delete_customer: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  debt_collection: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const GeoOperations: React.FC = () => {
  const { activeBranch } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedWorker, setSelectedWorker] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedMapId, setExpandedMapId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  // Get current user location for distance calculation
  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => console.warn('Could not get user location for distance calculation')
      );
    }
  }, []);

  const { data: visits, isLoading } = useVisitTrackingList({
    dateFrom,
    dateTo,
    workerId: selectedWorker,
    operationType: selectedType,
  });

  // Fetch full addresses for visits that have coordinates - Sequential with delay
  const fetchingRef = React.useRef<Set<string>>(new Set());
  const addrRef = React.useRef<Record<string, string>>({});

  // Sync addrRef with addresses state
  React.useEffect(() => {
    addrRef.current = addresses;
  }, [addresses]);

  React.useEffect(() => {
    if (!visits || visits.length === 0) return;

    let isMounted = true;

    const fetchQueue = async () => {
      for (const visit of visits) {
        if (!isMounted) break;

        // Check both state-ref and fetching-ref to avoid duplicates
        const alreadyFetched = !!addrRef.current[visit.id];
        const isFetching = fetchingRef.current.has(visit.id);

        if (visit.latitude && visit.longitude && !alreadyFetched && !isFetching) {
          fetchingRef.current.add(visit.id);

          try {
            const address = await reverseGeocode(visit.latitude, visit.longitude);
            if (isMounted) {
              setAddresses(prev => ({ ...prev, [visit.id]: address }));
              // Wait 1 second before next request to respect rate limits
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (err) {
            console.error('Failed to fetch address for visit:', visit.id, err);
            fetchingRef.current.delete(visit.id);
          }
        }
      }
    };

    fetchQueue();

    return () => {
      isMounted = false;
    };
  }, [visits]); // Remove addresses from dependency array

  // Fetch workers for filter
  const { data: workers } = useQuery({
    queryKey: ['workers-list-geo', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers_safe').select('id, full_name').eq('is_active', true);
      if (activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }
      const { data } = await query.order('full_name');
      return data || [];
    },
  });

  // Fetch all customers with coordinates for nearby calculation
  const { data: allCustomers } = useQuery({
    queryKey: ['customers-with-coords'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      return data || [];
    },
  });

  // Stats
  const stats = useMemo(() => {
    if (!visits) return { total: 0, orders: 0, sales: 0, deliveries: 0, customers: 0 };
    return {
      total: visits.length,
      orders: visits.filter(v => v.operation_type === 'order').length,
      sales: visits.filter(v => v.operation_type === 'direct_sale').length,
      deliveries: visits.filter(v => v.operation_type === 'delivery').length,
      customers: visits.filter(v => ['add_customer', 'update_customer', 'delete_customer'].includes(v.operation_type)).length,
    };
  }, [visits]);

  // Pre-calculate nearby customers for all visits
  const nearbyCustomersMap = useMemo(() => {
    if (!visits || !allCustomers) return {};
    const map: Record<string, any[]> = {};
    visits.forEach(visit => {
      if (!visit.latitude || !visit.longitude) return;
      map[visit.id] = allCustomers
        .map(c => ({
          ...c,
          dist: calculateDistance(visit.latitude, visit.longitude, c.latitude!, c.longitude!)
        }))
        .filter(c => c.dist <= 0.5 && c.id !== visit.customer_id)
        .sort((a, b) => a.dist - b.dist);
    });
    return map;
  }, [visits, allCustomers]);

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MapPin className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold">العمليات الجغرافية</h2>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.orders}</p>
            <p className="text-xs text-muted-foreground">طلبيات</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.sales}</p>
            <p className="text-xs text-muted-foreground">بيع مباشر</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 dark:bg-purple-950/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.deliveries}</p>
            <p className="text-xs text-muted-foreground">توصيلات</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.customers}</p>
            <p className="text-xs text-muted-foreground">عملاء جدد</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <Filter className="w-4 h-4" />
            تصفية
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={selectedWorker} onValueChange={setSelectedWorker}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="العامل" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">كل العمال</SelectItem>
                {workers?.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="نوع العملية" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">كل العمليات</SelectItem>
                <SelectItem value="order">طلبية</SelectItem>
                <SelectItem value="direct_sale">بيع مباشر</SelectItem>
                <SelectItem value="delivery">توصيل</SelectItem>
                <SelectItem value="add_customer">إضافة عميل</SelectItem>
                <SelectItem value="update_customer">تعديل زبون</SelectItem>
                <SelectItem value="delete_customer">حذف زبون</SelectItem>
                <SelectItem value="debt_collection">تحصيل دين</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !visits || visits.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>لا توجد عمليات مسجلة في هذه الفترة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{visits.length} عملية</p>
          {visits.map(visit => {
            const Icon = OPERATION_ICONS[visit.operation_type] || MapPin;
            const colorClass = OPERATION_COLORS[visit.operation_type] || 'bg-muted text-muted-foreground';

            // Calculate distance if coordinates and user location are available
            const userDistance = (visit.latitude && visit.longitude && userLocation)
              ? calculateDistance(userLocation.lat, userLocation.lng, visit.latitude, visit.longitude)
              : null;

            const nearbyCustomers = nearbyCustomersMap[visit.id] || [];

            return (
              <Card key={visit.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {getOperationLabel(visit.operation_type as OperationType)}
                          </Badge>
                          {visit.customer_name && (
                            <span className="text-sm font-medium">{visit.customer_name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="w-3 h-3" />
                            <span>{visit.worker_name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground border-r pr-2 shadow-none">
                            <Clock className="w-3 h-3" />
                            <span>{format(new Date(visit.created_at), 'dd/MM HH:mm', { locale: ar })}</span>
                          </div>
                          {userDistance !== null && (
                            <div className="flex items-center gap-1 text-xs font-bold text-teal-600 border-r pr-2">
                              <Navigation className="w-3 h-3" />
                              <span>بعدك: {formatDistance(userDistance)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`shrink-0 ${expandedMapId === visit.id ? 'bg-primary/10 text-primary' : ''}`}
                        onClick={() => setExpandedMapId(expandedMapId === visit.id ? null : visit.id)}
                        disabled={!visit.latitude || !visit.longitude}
                      >
                        <MapPin className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                          window.open(`https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`, '_blank');
                        }}
                        disabled={!visit.latitude || !visit.longitude}
                      >
                        <ExternalLink className="w-4 h-4 text-primary" />
                      </Button>
                    </div>
                  </div>

                  {(addresses[visit.id] || visit.address) && (
                    <div className="mt-2 mr-12 space-y-1">
                      {addresses[visit.id] && (
                        <p className="text-xs font-semibold text-primary flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {addresses[visit.id]}
                        </p>
                      )}
                      {visit.address && !addresses[visit.id]?.includes(visit.address) && (
                        <p className="text-xs text-muted-foreground">{visit.address}</p>
                      )}
                    </div>
                  )}

                  {/* Nearby Customers Buttons */}
                  {nearbyCustomers.length > 0 && (
                    <div className="mt-3 mr-12 space-y-2">
                      <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" />
                        عملاء قريبون (500م):
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {nearbyCustomers.map(customer => (
                          <Button
                            key={customer.id}
                            variant="destructive"
                            size="sm"
                            className="h-8 text-[11px] bg-red-600 hover:bg-red-700 text-white border-none shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 px-3"
                            onClick={() => {
                              window.open(`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`, '_blank');
                            }}
                          >
                            <MapPin className="w-3 h-3" />
                            {customer.store_name || customer.name} ({formatDistance(customer.dist)})
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Inline Map View */}
                  {expandedMapId === visit.id && visit.latitude && visit.longitude && (
                    <div className="mt-3 border-t pt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <CustomerLocationView
                        latitude={visit.latitude}
                        longitude={visit.longitude}
                        customerName={visit.customer_name}
                        address={visit.address}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GeoOperations;
