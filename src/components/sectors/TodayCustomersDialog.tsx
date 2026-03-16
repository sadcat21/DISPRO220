import React, { useMemo, useState } from 'react';
import CustomerLabel from '@/components/customers/CustomerLabel';
import { getLocalizedName } from '@/utils/sectorName';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Truck, ShoppingCart, Landmark, User, Phone, Eye, EyeOff, CheckCircle, PackageX, PackageCheck, Navigation, Loader2, MapPinOff, Clock, Check, X, DoorClosed, UserX, ShoppingBag, Printer, XCircle, Search, BanknoteIcon, Pencil } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useSectorCoverage } from '@/hooks/useSectorCoverage';
import { useAuth } from '@/contexts/AuthContext';
import { useDueDebts, DueDebt } from '@/hooks/useDebtCollections';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { useLocationThreshold } from '@/hooks/useLocationSettings';
import { useHasPermission } from '@/hooks/usePermissions';
import { calculateDistance } from '@/utils/geoUtils';
import { OrderWithDetails } from '@/types/database';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DeliverySaleDialog from '@/components/orders/DeliverySaleDialog';
import CreateOrderDialog from '@/components/orders/CreateOrderDialog';
import VisitNoPaymentDialog from '@/components/debts/VisitNoPaymentDialog';
import CollectDebtDialog from '@/components/debts/CollectDebtDialog';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';
import ReceiptDialog from '@/components/printing/ReceiptDialog';
import ModifyOrderDialog from '@/components/orders/ModifyOrderDialog';
import { useOrderItems } from '@/hooks/useOrders';
import { ReceiptItem } from '@/types/receipt';

const DAY_NAMES: Record<string, string> = {
  saturday: 'السبت', sunday: 'الأحد', monday: 'الإثنين',
  tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const JS_DAY_TO_NAME: Record<number, string> = {
  6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
};

interface TodayCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetWorkerId?: string;
  targetWorkerName?: string;
}

const TodayCustomersDialog: React.FC<TodayCustomersDialogProps> = ({
  open, onOpenChange, targetWorkerId, targetWorkerName,
}) => {
  const { workerId: authWorkerId, activeBranch, role, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === 'admin' || role === 'branch_admin' || role === 'supervisor';
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const [selectedDay, setSelectedDay] = useState(todayName);
  const { trackVisit } = useTrackVisit();
  const { data: locationThreshold } = useLocationThreshold();
  const canBypassLocation = useHasPermission('bypass_location_check');

  // Admin worker picker state
  const [selectedAdminWorkerId, setSelectedAdminWorkerId] = useState<string | null>(targetWorkerId || null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch workers list for admin picker
  const { data: workersList = [] } = useQuery({
    queryKey: ['today-cust-workers-list', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, username').eq('is_active', true);
      if (activeBranch && role === 'branch_admin') query = query.eq('branch_id', activeBranch.id);
      const { data } = await query.order('full_name');
      return data || [];
    },
    enabled: (role === 'admin' || role === 'branch_admin' || role === 'supervisor') && open && !targetWorkerId,
  });

  // For admin: use selected worker or fallback to auth worker
  const effectiveWorkerId = targetWorkerId || (isAdmin && selectedAdminWorkerId ? selectedAdminWorkerId : authWorkerId);
  const effectiveWorkerName = targetWorkerName || (isAdmin && selectedAdminWorkerId ? workersList.find(w => w.id === selectedAdminWorkerId)?.full_name : undefined);
  const hasSpecificWorker = !!(targetWorkerId || selectedAdminWorkerId);
  const scopedBranchId = useMemo(() => {
    if (!activeBranch?.id) return null;
    // Bypass branch filter when viewing a specific worker's data (admin tracking)
    // or when the worker views their own data (already scoped by worker via sector_schedules & assigned_worker_id)
    if (hasSpecificWorker || !isAdmin) return null;
    return activeBranch.id;
  }, [activeBranch?.id, isAdmin, hasSpecificWorker]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Compute the actual date for the selectedDay in the current Saturday-based week
  const NAME_TO_JS_DAY: Record<string, number> = {
    saturday: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  };
  const selectedDayBounds = useMemo(() => {
    const now = new Date();
    const currentJsDay = now.getDay();
    const targetJsDay = NAME_TO_JS_DAY[selectedDay] ?? currentJsDay;

    // Calculate the Saturday-based week start
    const daysFromSaturday = currentJsDay === 6 ? 0 : currentJsDay + 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromSaturday);
    weekStart.setHours(0, 0, 0, 0);

    // Calculate target day offset from Saturday
    const targetOffset = targetJsDay === 6 ? 0 : targetJsDay + 1;
    const targetDate = new Date(weekStart);
    targetDate.setDate(weekStart.getDate() + targetOffset);

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      weekStart: weekStart.toISOString(),
    };
  }, [selectedDay]);

  // Sub-dialog states
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [pendingDeliveryOrder, setPendingDeliveryOrder] = useState<OrderWithDetails | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [selectedCustomerForOrder, setSelectedCustomerForOrder] = useState<string | null>(null);
  const [showVisitNoPayment, setShowVisitNoPayment] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [showCollectDebt, setShowCollectDebt] = useState(false);
  const [checkingLocationFor, setCheckingLocationFor] = useState<string | null>(null);
  const [loadingDeliveryFor, setLoadingDeliveryFor] = useState<string | null>(null);
  const [orderDetailsDialog, setOrderDetailsDialog] = useState<any>(null);
  const [showDirectSale, setShowDirectSale] = useState(false);
  const [directSaleCustomerId, setDirectSaleCustomerId] = useState<string | null>(null);
  const [printReceiptData, setPrintReceiptData] = useState<any>(null);
  const [showPrintReceipt, setShowPrintReceipt] = useState(false);

  // Data queries
  const { data: sectors = [] } = useQuery({
    queryKey: ['today-cust-sectors', effectiveWorkerId, scopedBranchId],
    queryFn: async () => {
      let query = supabase.from('sectors').select('*');
      if (scopedBranchId) query = query.eq('branch_id', scopedBranchId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Fetch sector_schedules for multi-schedule support
  const { data: sectorSchedules = [] } = useQuery({
    queryKey: ['today-cust-sector-schedules', scopedBranchId],
    queryFn: async () => {
      const { data } = await supabase.from('sector_schedules').select('*');
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['today-cust-customers', scopedBranchId],
    queryFn: async () => {
      let query = supabase.from('customers').select('id, name, phone, wilaya, sector_id, zone_id, store_name, latitude, longitude, customer_type').not('sector_id', 'is', null);
      if (scopedBranchId) query = query.eq('branch_id', scopedBranchId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  const { data: todayVisits = [] } = useQuery({
    queryKey: ['today-visits-dialog', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('visit_tracking')
        .select('customer_id, operation_type, notes, created_at, latitude, longitude')
        .eq('worker_id', effectiveWorkerId!)
        .gte('created_at', todayStart);
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
    refetchInterval: 10000,
  });

  const { data: todayOrders = [] } = useQuery({
    queryKey: ['today-orders-dialog', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('customer_id, created_at')
        .eq('created_by', effectiveWorkerId!)
        .gte('created_at', todayStart)
        .not('status', 'eq', 'cancelled');
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
    refetchInterval: 10000,
  });

  // Load merge assignments setting
  const { data: mergeAssignmentsSetting } = useQuery({
    queryKey: ['coverage-merge-assignments-setting'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'coverage_merge_assignments')
        .maybeSingle();
      return data ? data.value !== 'false' : true; // default true
    },
    enabled: open,
  });
  const shouldMergeAssignments = mergeAssignmentsSetting ?? true;

  // Fetch all zones for badge display and grouping
  const { data: allZones = [] } = useQuery({
    queryKey: ['today-cust-zones'],
    queryFn: async () => {
      const { data } = await supabase.from('sector_zones').select('*').order('name');
      return data || [];
    },
    enabled: open,
  });

  const { data: todayDeliveredOrders = [] } = useQuery({
    queryKey: ['today-delivered-dialog', effectiveWorkerId, selectedDayBounds.start, selectedDayBounds.end, isAdmin],
    queryFn: async () => {
      // Use stock_movements to determine actual delivery time accurately
      let smQuery = supabase
        .from('stock_movements')
        .select('order_id, created_at')
        .eq('movement_type', 'delivery')
        .gte('created_at', selectedDayBounds.start)
        .lte('created_at', selectedDayBounds.end);
      if (!isAdmin || hasSpecificWorker) {
        smQuery = smQuery.eq('worker_id', effectiveWorkerId!);
      }
      const { data: movements } = await smQuery;
      if (!movements || movements.length === 0) return [];

      // Build a map of order_id -> earliest delivery time
      const deliveryTimeMap: Record<string, string> = {};
      movements.forEach(m => {
        if (m.order_id && (!deliveryTimeMap[m.order_id] || m.created_at < deliveryTimeMap[m.order_id])) {
          deliveryTimeMap[m.order_id] = m.created_at;
        }
      });

      const orderIds = [...new Set(movements.map(m => m.order_id).filter(Boolean))];
      if (orderIds.length === 0) return [];

      const { data } = await supabase
        .from('orders')
        .select('id, customer_id, status, assigned_worker_id')
        .in('id', orderIds)
        .eq('status', 'delivered');
      return (data || []).map(o => ({ ...o, delivered_at: deliveryTimeMap[o.id] || null }));
    },
    enabled: !!effectiveWorkerId && open,
    refetchInterval: 10000,
  });

  const { data: dueDebts = [] } = useDueDebts(undefined);
  const { data: allDebts = [] } = useDueDebts('__all__');

  const { data: todayCollections = [] } = useQuery({
    queryKey: ['today-debt-collections-dialog', effectiveWorkerId, todayDateStr],
    queryFn: async () => {
      let query = supabase
        .from('debt_collections')
        .select('debt_id, action, amount_collected, status, created_at')
        .eq('collection_date', todayDateStr);
      if (!isAdmin || hasSpecificWorker) {
        query = query.eq('worker_id', effectiveWorkerId!);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
    refetchInterval: 10000,
  });

  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: recentNegativeVisits = [] } = useQuery({
    queryKey: ['recent-negative-visits-dialog', effectiveWorkerId, sevenDaysAgo],
    queryFn: async () => {
      const { data } = await supabase
        .from('visit_tracking')
        .select('customer_id, notes, created_at')
        .gte('created_at', sevenDaysAgo)
        .or('notes.ilike.%مغلق%,notes.ilike.%غير متاح%,notes.ilike.%بدون طلبية%');
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Worker stock for direct sale
  const { data: workerStock = [] } = useQuery({
    queryKey: ['my-worker-stock', effectiveWorkerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('worker_stock')
        .select('id, product_id, quantity, product:products(*)')
        .eq('worker_id', effectiveWorkerId!)
        .gt('quantity', 0);
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Today's direct sales (receipts of type direct_sale)
  const { data: todayDirectSales = [] } = useQuery({
    queryKey: ['today-direct-sales-dialog', effectiveWorkerId, todayStart],
    queryFn: async () => {
      let query = supabase
        .from('receipts')
        .select('customer_id, items, total_amount, customer_name, created_at')
        .eq('receipt_type', 'direct_sale')
        .gte('created_at', todayStart);
      if (!isAdmin || hasSpecificWorker) {
        query = query.eq('worker_id', effectiveWorkerId!);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
    refetchInterval: 10000,
  });

  // Today's direct sale visit tracking (for "بدون بيع")
  const { data: todayDirectSaleVisits = [] } = useQuery({
    queryKey: ['today-direct-sale-visits-dialog', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('visit_tracking')
        .select('customer_id, notes')
        .eq('worker_id', effectiveWorkerId!)
        .gte('created_at', todayStart)
        .or('notes.ilike.%بدون بيع%,notes.ilike.%مغلق (بيع مباشر)%,notes.ilike.%غير متاح (بيع مباشر)%');
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
    refetchInterval: 10000,
  });

  // Sector coverage (substitution system)
  const { getActiveCoveragesForDate } = useSectorCoverage();
  const selectedDateStr = useMemo(() => {
    const now = new Date();
    const currentJsDay = now.getDay();
    const daysFromSaturday = currentJsDay === 6 ? 0 : currentJsDay + 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromSaturday);
    const targetJsDay = NAME_TO_JS_DAY[selectedDay] ?? currentJsDay;
    const targetOffset = targetJsDay === 6 ? 0 : targetJsDay + 1;
    const targetDate = new Date(weekStart);
    targetDate.setDate(weekStart.getDate() + targetOffset);
    return targetDate.toISOString().split('T')[0];
  }, [selectedDay]);

  const activeCoveragesForSelectedDay = useMemo(() => {
    const activeCoverages = getActiveCoveragesForDate(selectedDateStr);

    return activeCoverages.filter((coverage) => {
      const scopedSchedules = sectorSchedules.filter(
        (sc) => sc.sector_id === coverage.sector_id && sc.schedule_type === coverage.schedule_type
      );

      if (scopedSchedules.length > 0) {
        return scopedSchedules.some(
          (sc) => sc.day === selectedDay && sc.worker_id === coverage.absent_worker_id
        );
      }

      const sector = sectors.find((s) => s.id === coverage.sector_id);
      if (!sector) return false;

      if (coverage.schedule_type === 'sales') {
        return sector.visit_day_sales === selectedDay && sector.sales_worker_id === coverage.absent_worker_id;
      }

      return sector.visit_day_delivery === selectedDay && sector.delivery_worker_id === coverage.absent_worker_id;
    });
  }, [getActiveCoveragesForDate, selectedDateStr, sectorSchedules, selectedDay, sectors]);

  // Get absent worker IDs that effectiveWorker is covering today
  const coveredAbsentWorkerIds = useMemo(() => {
    if (!shouldMergeAssignments || !effectiveWorkerId) return [];
    return [...new Set(
      activeCoveragesForSelectedDay
        .filter(c => c.substitute_worker_id === effectiveWorkerId)
        .map(c => c.absent_worker_id)
    )];
  }, [shouldMergeAssignments, effectiveWorkerId, activeCoveragesForSelectedDay]);

  const { data: assignedOrders = [] } = useQuery({
    queryKey: ['today-cust-assigned-orders-full', effectiveWorkerId, todayDateStr, scopedBranchId, coveredAbsentWorkerIds],
    queryFn: async () => {
      const workerIds = [effectiveWorkerId!, ...coveredAbsentWorkerIds];
      let query = supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .in('status', ['pending', 'assigned', 'in_progress']);
      if (!isAdmin || hasSpecificWorker) {
        query = query.in('assigned_worker_id', workerIds);
      } else if (scopedBranchId) {
        query = query.eq('branch_id', scopedBranchId);
      }
      const { data } = await query;
      return (data || []) as OrderWithDetails[];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Computed data - use sector_schedules for determining today's sectors
  const todaySalesSectorIds = useMemo(() => {
    const ids = new Set<string>();

    // From sector_schedules
    sectorSchedules.forEach(sc => {
      if (sc.day === selectedDay && sc.schedule_type === 'sales') {
        if (!hasSpecificWorker && isAdmin) {
          ids.add(sc.sector_id);
        } else if (sc.worker_id === effectiveWorkerId) {
          ids.add(sc.sector_id);
        }
      }
    });

    // Fallback: legacy fields for sectors without schedules
    sectors.forEach(s => {
      const hasSalesSchedule = sectorSchedules.some(sc => sc.sector_id === s.id && sc.schedule_type === 'sales');
      if (hasSalesSchedule) return;

      if (s.visit_day_sales === selectedDay) {
        if (!hasSpecificWorker && isAdmin) ids.add(s.id);
        else if (s.sales_worker_id === effectiveWorkerId) ids.add(s.id);
      }
    });

    // Apply substitution transfers for this selected day
    if (effectiveWorkerId) {
      // Check if any coverage with 'replace' mode exists for this worker as substitute
      const hasReplaceMode = activeCoveragesForSelectedDay.some(
        c => c.substitute_worker_id === effectiveWorkerId && c.schedule_type === 'sales' && c.coverage_mode === 'replace'
      );

      if (hasReplaceMode) {
        // In replace mode: remove worker's own sectors, only keep covered ones
        const ownSectorIds = new Set(ids);
        ownSectorIds.forEach(id => ids.delete(id));
      }

      activeCoveragesForSelectedDay.forEach(c => {
        if (c.schedule_type !== 'sales') return;
        if (c.absent_worker_id === effectiveWorkerId) ids.delete(c.sector_id);
        if (c.substitute_worker_id === effectiveWorkerId) ids.add(c.sector_id);
      });
    }

    return ids;
  }, [sectorSchedules, sectors, selectedDay, effectiveWorkerId, isAdmin, hasSpecificWorker, activeCoveragesForSelectedDay]);

  const todayDeliverySectorIds = useMemo(() => {
    const ids = new Set<string>();

    sectorSchedules.forEach(sc => {
      if (sc.day === selectedDay && sc.schedule_type === 'delivery') {
        if (!hasSpecificWorker && isAdmin) {
          ids.add(sc.sector_id);
        } else if (sc.worker_id === effectiveWorkerId) {
          ids.add(sc.sector_id);
        }
      }
    });

    sectors.forEach(s => {
      const hasDeliverySchedule = sectorSchedules.some(sc => sc.sector_id === s.id && sc.schedule_type === 'delivery');
      if (hasDeliverySchedule) return;

      if (s.visit_day_delivery === selectedDay) {
        if (!hasSpecificWorker && isAdmin) ids.add(s.id);
        else if (s.delivery_worker_id === effectiveWorkerId) ids.add(s.id);
      }
    });

    // Apply substitution transfers for this selected day
    if (effectiveWorkerId) {
      const hasReplaceMode = activeCoveragesForSelectedDay.some(
        c => c.substitute_worker_id === effectiveWorkerId && c.schedule_type === 'delivery' && c.coverage_mode === 'replace'
      );

      if (hasReplaceMode) {
        const ownSectorIds = new Set(ids);
        ownSectorIds.forEach(id => ids.delete(id));
      }

      activeCoveragesForSelectedDay.forEach(c => {
        if (c.schedule_type !== 'delivery') return;
        if (c.absent_worker_id === effectiveWorkerId) ids.delete(c.sector_id);
        if (c.substitute_worker_id === effectiveWorkerId) ids.add(c.sector_id);
      });
    }

    return ids;
  }, [sectorSchedules, sectors, selectedDay, effectiveWorkerId, isAdmin, hasSpecificWorker, activeCoveragesForSelectedDay]);

  const availableWorkerIdsForSelectedDay = useMemo(() => {
    const workerAssignments = new Map<string, Set<string>>();

    const addAssignment = (workerId: string | null, key: string) => {
      if (!workerId) return;
      if (!workerAssignments.has(workerId)) workerAssignments.set(workerId, new Set<string>());
      workerAssignments.get(workerId)!.add(key);
    };

    const removeAssignment = (workerId: string | null, key: string) => {
      if (!workerId) return;
      const current = workerAssignments.get(workerId);
      if (!current) return;
      current.delete(key);
      if (current.size === 0) workerAssignments.delete(workerId);
    };

    // Base assignments from new schedule system
    sectorSchedules.forEach((sc) => {
      if (sc.day !== selectedDay || !sc.worker_id) return;
      addAssignment(sc.worker_id, `${sc.schedule_type}:${sc.sector_id}`);
    });

    // Fallback assignments from legacy day fields
    sectors.forEach((s) => {
      const hasSalesSchedule = sectorSchedules.some((sc) => sc.sector_id === s.id && sc.schedule_type === 'sales');
      const hasDeliverySchedule = sectorSchedules.some((sc) => sc.sector_id === s.id && sc.schedule_type === 'delivery');

      if (!hasSalesSchedule && s.visit_day_sales === selectedDay) {
        addAssignment(s.sales_worker_id, `sales:${s.id}`);
      }

      if (!hasDeliverySchedule && s.visit_day_delivery === selectedDay) {
        addAssignment(s.delivery_worker_id, `delivery:${s.id}`);
      }
    });

    // Apply transfers from coverage records
    activeCoveragesForSelectedDay.forEach((coverage) => {
      const key = `${coverage.schedule_type}:${coverage.sector_id}`;
      removeAssignment(coverage.absent_worker_id, key);
      addAssignment(coverage.substitute_worker_id, key);
    });

    return new Set(
      Array.from(workerAssignments.entries())
        .filter(([, assignments]) => assignments.size > 0)
        .map(([workerId]) => workerId)
    );
  }, [sectorSchedules, sectors, selectedDay, activeCoveragesForSelectedDay]);

  // IMPORTANT: filter from all sectors using the computed IDs (which already include coverage substitutions)
  // so covered sectors appear immediately in direct-sale/delivery lists for substitute workers.
  const todaySalesSectors = useMemo(() => sectors.filter(s => todaySalesSectorIds.has(s.id)), [sectors, todaySalesSectorIds]);
  const todayDeliverySectors = useMemo(() => sectors.filter(s => todayDeliverySectorIds.has(s.id)), [sectors, todayDeliverySectorIds]);

  const deliveryCustomerIdsWithOrders = useMemo(() => {
    const ids = new Set<string>();
    const deliverySectorIds = new Set(todayDeliverySectors.map(s => s.id));
    assignedOrders.forEach(o => {
      if (!o.customer_id) return;
      const customer = customers.find(c => c.id === o.customer_id);
      const matchesSector = customer?.sector_id && deliverySectorIds.has(customer.sector_id);
      // Only include non-sector orders if they are explicitly assigned to this worker with today's date
      const isExplicitlyAssigned = o.delivery_date && o.delivery_date.startsWith(todayDateStr) && o.assigned_worker_id === effectiveWorkerId;
      if (matchesSector || isExplicitlyAssigned) ids.add(o.customer_id);
    });
    todayDeliveredOrders.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    return ids;
  }, [assignedOrders, todayDeliveredOrders, todayDeliverySectors, customers, todayDateStr, effectiveWorkerId]);

  const deliveryCustomers = useMemo(() => customers.filter(c => deliveryCustomerIdsWithOrders.has(c.id)), [customers, deliveryCustomerIdsWithOrders]);
  const salesCustomers = useMemo(() => {
    const sectorIds = new Set(todaySalesSectors.map(s => s.id));
    return customers.filter(c => c.sector_id && sectorIds.has(c.sector_id));
  }, [customers, todaySalesSectors]);

  const visitedCustomerIds = useMemo(() => new Set(todayVisits.filter(v => v.operation_type === 'visit').map(v => v.customer_id).filter(Boolean)), [todayVisits]);
  const orderedCustomerIds = useMemo(() => new Set(todayOrders.map(o => o.customer_id).filter(Boolean)), [todayOrders]);
  const salesNotVisited = useMemo(() => salesCustomers.filter(c => !visitedCustomerIds.has(c.id) && !orderedCustomerIds.has(c.id)), [salesCustomers, visitedCustomerIds, orderedCustomerIds]);
  const salesVisitedNoOrder = useMemo(() => salesCustomers.filter(c => visitedCustomerIds.has(c.id) && !orderedCustomerIds.has(c.id)), [salesCustomers, visitedCustomerIds, orderedCustomerIds]);

  // Sub-categorize salesVisitedNoOrder based on visit notes
  const closedCustomerIds = useMemo(() => new Set(
    todayVisits.filter(v => v.operation_type === 'visit' && v.notes && /مغلق/.test(v.notes)).map(v => v.customer_id).filter(Boolean)
  ), [todayVisits]);
  const unavailableCustomerIds = useMemo(() => new Set(
    todayVisits.filter(v => v.operation_type === 'visit' && v.notes && /غير متاح/.test(v.notes)).map(v => v.customer_id).filter(Boolean)
  ), [todayVisits]);
  const salesVisitedOnly = useMemo(() => salesVisitedNoOrder.filter(c => !closedCustomerIds.has(c.id) && !unavailableCustomerIds.has(c.id)), [salesVisitedNoOrder, closedCustomerIds, unavailableCustomerIds]);
  const salesClosed = useMemo(() => salesVisitedNoOrder.filter(c => closedCustomerIds.has(c.id)), [salesVisitedNoOrder, closedCustomerIds]);
  const salesUnavailable = useMemo(() => salesVisitedNoOrder.filter(c => unavailableCustomerIds.has(c.id)), [salesVisitedNoOrder, unavailableCustomerIds]);
  const salesWithOrders = useMemo(() => salesCustomers.filter(c => orderedCustomerIds.has(c.id)), [salesCustomers, orderedCustomerIds]);

  const deliveredCustomerIds = useMemo(() => new Set(todayDeliveredOrders.map(o => o.customer_id).filter(Boolean)), [todayDeliveredOrders]);
  const customerDeliveryTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    todayDeliveredOrders.forEach(o => {
      if (o.customer_id && o.delivered_at) map.set(o.customer_id, o.delivered_at);
    });
    return map;
  }, [todayDeliveredOrders]);

  // Time maps for visits, orders, and direct sales
  const visitTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    todayVisits.forEach(v => {
      if (v.customer_id && v.created_at) {
        if (!map.has(v.customer_id) || v.created_at > map.get(v.customer_id)!) {
          map.set(v.customer_id, v.created_at);
        }
      }
    });
    return map;
  }, [todayVisits]);

  const orderTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    todayOrders.forEach(o => {
      if (o.customer_id && o.created_at) {
        if (!map.has(o.customer_id) || o.created_at > map.get(o.customer_id)!) {
          map.set(o.customer_id, o.created_at);
        }
      }
    });
    return map;
  }, [todayOrders]);

  const directSaleTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    todayDirectSales.forEach(s => {
      if (s.customer_id && s.created_at) {
        if (!map.has(s.customer_id) || s.created_at > map.get(s.customer_id)!) {
          map.set(s.customer_id, s.created_at);
        }
      }
    });
    return map;
  }, [todayDirectSales]);

  const debtCollectionTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    todayCollections.forEach(c => {
      if (c.debt_id && c.created_at) {
        if (!map.has(c.debt_id) || c.created_at > map.get(c.debt_id)!) {
          map.set(c.debt_id, c.created_at);
        }
      }
    });
    return map;
  }, [todayCollections]);

  // Distance map: customer_id -> distance in meters (worker position at visit time vs customer stored location)
  const customerDistanceMap = useMemo(() => {
    const map = new Map<string, number>();
    todayVisits.forEach(v => {
      if (v.customer_id && v.latitude && v.longitude) {
        const customer = customers.find(c => c.id === v.customer_id);
        if (customer?.latitude && customer?.longitude) {
          const distKm = calculateDistance(v.latitude, v.longitude, customer.latitude, customer.longitude);
          const distMeters = Math.round(distKm * 1000);
          // Keep the most recent visit distance
          if (!map.has(v.customer_id) || (v.created_at && v.created_at > (todayVisits.find(tv => tv.customer_id === v.customer_id && map.has(v.customer_id))?.created_at || ''))) {
            map.set(v.customer_id, distMeters);
          }
        }
      }
    });
    return map;
  }, [todayVisits, customers]);

  const deliveryVisitedCustomerIds = useMemo(() => new Set(todayVisits.filter(v => v.operation_type === 'delivery_visit').map(v => v.customer_id).filter(Boolean)), [todayVisits]);
  const deliveryNotDone = useMemo(() => deliveryCustomers.filter(c => !deliveredCustomerIds.has(c.id) && !deliveryVisitedCustomerIds.has(c.id)), [deliveryCustomers, deliveredCustomerIds, deliveryVisitedCustomerIds]);
  const deliveryNotReceived = useMemo(() => deliveryCustomers.filter(c => deliveryVisitedCustomerIds.has(c.id) && !deliveredCustomerIds.has(c.id)), [deliveryCustomers, deliveryVisitedCustomerIds, deliveredCustomerIds]);
  const deliveryReceived = useMemo(() => deliveryCustomers.filter(c => deliveredCustomerIds.has(c.id)), [deliveryCustomers, deliveredCustomerIds]);

  const collectedDebtIds = useMemo(() => new Set(todayCollections.filter(c => c.action !== 'no_payment').map(c => c.debt_id)), [todayCollections]);
  const noPaymentDebtIds = useMemo(() => new Set(todayCollections.filter(c => c.action === 'no_payment').map(c => c.debt_id)), [todayCollections]);
  const debtCustomers = useMemo(() => {
    if (hasSpecificWorker) return dueDebts.filter(d => d.worker_id === effectiveWorkerId);
    return dueDebts;
  }, [dueDebts, effectiveWorkerId, hasSpecificWorker]);
  const debtsToCollectToday = useMemo(() => debtCustomers.filter(d => !collectedDebtIds.has(d.id) && !noPaymentDebtIds.has(d.id)), [debtCustomers, collectedDebtIds, noPaymentDebtIds]);
  const debtsCollectedToday = useMemo(() => debtCustomers.filter(d => collectedDebtIds.has(d.id)), [debtCustomers, collectedDebtIds]);
  const debtsNoPaymentToday = useMemo(() => debtCustomers.filter(d => noPaymentDebtIds.has(d.id)), [debtCustomers, noPaymentDebtIds]);
  const allDebtsFiltered = useMemo(() => {
    if (hasSpecificWorker) return allDebts.filter(d => d.worker_id === effectiveWorkerId);
    return allDebts;
  }, [allDebts, effectiveWorkerId, hasSpecificWorker]);

  // Fetch sales worker visits for Prévente sectors to know which customers were visited
  const preventeDeliverySectors = useMemo(() => todayDeliverySectors.filter(s => (s as any).sector_type !== 'cash_van'), [todayDeliverySectors]);
  const salesWorkerIds = useMemo(() => {
    const preventeSectorIds = new Set(preventeDeliverySectors.map(s => s.id));
    const workersBySector = new Map<string, Set<string>>();

    preventeDeliverySectors.forEach((sector) => {
      workersBySector.set(sector.id, new Set<string>());

      const todaySalesSchedules = sectorSchedules.filter(
        (sc) => sc.sector_id === sector.id && sc.schedule_type === 'sales' && sc.day === selectedDay
      );

      if (todaySalesSchedules.length > 0) {
        todaySalesSchedules.forEach((sc) => {
          if (sc.worker_id) workersBySector.get(sector.id)?.add(sc.worker_id);
        });
      } else if (sector.visit_day_sales === selectedDay && sector.sales_worker_id) {
        workersBySector.get(sector.id)?.add(sector.sales_worker_id);
      }
    });

    // Apply selected-day coverage overrides for sales assignments
    activeCoveragesForSelectedDay.forEach((coverage) => {
      if (coverage.schedule_type !== 'sales' || !preventeSectorIds.has(coverage.sector_id)) return;
      const assignedWorkers = workersBySector.get(coverage.sector_id);
      if (!assignedWorkers) return;
      if (coverage.absent_worker_id) assignedWorkers.delete(coverage.absent_worker_id);
      if (coverage.substitute_worker_id) assignedWorkers.add(coverage.substitute_worker_id);
    });

    return Array.from(new Set(
      Array.from(workersBySector.values()).flatMap((set) => Array.from(set))
    ));
  }, [preventeDeliverySectors, sectorSchedules, selectedDay, activeCoveragesForSelectedDay]);

  const preventeCustomerIds = useMemo(() => {
    const preventeSectorIds = new Set(preventeDeliverySectors.map(s => s.id));
    return customers
      .filter(c => c.sector_id && preventeSectorIds.has(c.sector_id))
      .map(c => c.id);
  }, [customers, preventeDeliverySectors]);

  const { data: salesRepStatuses = [] } = useQuery({
    queryKey: ['sales-rep-statuses-for-prevente', salesWorkerIds, preventeCustomerIds, selectedDayBounds.weekStart, selectedDayBounds.end],
    queryFn: async () => {
      if (salesWorkerIds.length === 0 || preventeCustomerIds.length === 0) return [];

      const { data, error } = await (supabase as any).rpc('get_customer_sales_rep_statuses', {
        p_worker_ids: salesWorkerIds,
        p_customer_ids: preventeCustomerIds,
        p_start: selectedDayBounds.weekStart,
        p_end: selectedDayBounds.end,
      });

      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open && salesWorkerIds.length > 0 && preventeCustomerIds.length > 0,
    refetchInterval: 10000,
  });

  // Customers ordered by sales reps in Prévente sectors for selected day
  const salesWorkerOrderedCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    (salesRepStatuses as any[]).forEach((row) => {
      if (row?.status === 'ordered' && row?.customer_id) ids.add(row.customer_id);
    });
    return ids;
  }, [salesRepStatuses]);

  // Sales rep visit status map for Prévente customers (used for badges)
  // Status: 'ordered' | 'visited' | 'closed' | 'unavailable' | 'not_visited'
  const salesRepStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    const preventeSectorIds = new Set(preventeDeliverySectors.map(s => s.id));

    customers.forEach(c => {
      if (c.sector_id && preventeSectorIds.has(c.sector_id)) {
        map.set(c.id, 'not_visited');
      }
    });

    (salesRepStatuses as any[]).forEach((row) => {
      if (row?.customer_id && row?.status && map.has(row.customer_id)) {
        map.set(row.customer_id, row.status);
      }
    });

    return map;
  }, [salesRepStatuses, customers, preventeDeliverySectors]);

  // Direct sale customers:
  // 1. Cash Van sectors (today delivery) → ALL customers
  // 2. Prévente sectors (today delivery) → ALL customers EXCEPT those with pending delivery orders or already ordered by sales rep
  const directSaleCustomers = useMemo(() => {
    const cashVanSectorIds = new Set(todayDeliverySectors.filter(s => (s as any).sector_type === 'cash_van').map(s => s.id));
    const preventeSectorIds = new Set(preventeDeliverySectors.map(s => s.id));
    
    const cashVanCustomers = customers.filter(c => c.sector_id && cashVanSectorIds.has(c.sector_id) && !deliveredCustomerIds.has(c.id));
    const preventeAllCustomers = customers.filter(c => {
      if (!c.sector_id || !preventeSectorIds.has(c.sector_id)) return false;
      // If this sector is also in the worker's sales schedule, customers are handled by orders tab
      if (todaySalesSectorIds.has(c.sector_id)) return false;
      if (deliveryCustomerIdsWithOrders.has(c.id) || deliveredCustomerIds.has(c.id)) return false;
      if (salesWorkerOrderedCustomerIds.has(c.id)) return false;
      // Show only customers that are truly not visited by sales rep
      const repStatus = salesRepStatusMap.get(c.id);
      if (repStatus && repStatus !== 'not_visited') return false;
      return true;
    });
    
    const combined = new Map<string, typeof customers[0]>();
    [...cashVanCustomers, ...preventeAllCustomers].forEach(c => combined.set(c.id, c));
    return Array.from(combined.values());
  }, [todayDeliverySectors, preventeDeliverySectors, customers, deliveredCustomerIds, deliveryCustomerIdsWithOrders, salesWorkerOrderedCustomerIds, salesRepStatusMap, todaySalesSectorIds]);

  // Direct sale sub-categorization
  const directSoldCustomerIds = useMemo(() => new Set(todayDirectSales.map(s => s.customer_id).filter(Boolean)), [todayDirectSales]);
  const directNoSaleCustomerIds = useMemo(() => new Set(todayDirectSaleVisits.map(v => v.customer_id).filter(Boolean)), [todayDirectSaleVisits]);
  const directSalePending = useMemo(() => directSaleCustomers.filter(c => !directSoldCustomerIds.has(c.id) && !directNoSaleCustomerIds.has(c.id)), [directSaleCustomers, directSoldCustomerIds, directNoSaleCustomerIds]);
  const directSaleSold = useMemo(() => directSaleCustomers.filter(c => directSoldCustomerIds.has(c.id)), [directSaleCustomers, directSoldCustomerIds]);
  const directSaleNoSale = useMemo(() => directSaleCustomers.filter(c => directNoSaleCustomerIds.has(c.id) && !directSoldCustomerIds.has(c.id)), [directSaleCustomers, directNoSaleCustomerIds, directSoldCustomerIds]);

  // Location check
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
        const formattedDistance = distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} كم` : `${Math.round(distanceMeters)} متر`;
        toast.error(`📍 أنت بعيد عن العميل بمسافة ${formattedDistance}`, { description: `يجب أن تكون على بُعد ${threshold} متر أو أقل` });
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

  // Handlers
  const handleDeliveryCustomerClick = async (customer: any) => {
    setLoadingDeliveryFor(customer.id);
    try {
      let query = supabase
        .from('orders')
        .select('*, customer:customers(*, sector:sectors(id, name, name_fr), zone:sector_zones(id, name, name_fr)), created_by_worker:workers!orders_created_by_fkey(id, full_name, username)')
        .eq('customer_id', customer.id)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (!isAdmin) query = query.eq('assigned_worker_id', effectiveWorkerId!);
      const { data, error } = await query;
      if (error) throw error;
      if (data && data.length > 0) {
        setPendingDeliveryOrder(data[0] as OrderWithDetails);
        setShowDeliveryDialog(true);
      } else {
        toast.error('لا توجد طلبية معينة لهذا العميل');
      }
    } catch {
      toast.error('خطأ في جلب بيانات الطلبية');
    } finally {
      setLoadingDeliveryFor(null);
    }
  };

  const handleShowDeliveredOrderDetails = async (customer: any) => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('customer_id', customer.id)
        .eq('status', 'delivered')
        .gte('updated_at', todayStart)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const hydratedItems = await hydrateOrderItems(data[0]);
        setOrderDetailsDialog({ ...data[0], items: hydratedItems });
      } else {
        toast.error('لم يتم العثور على تفاصيل الطلبية');
      }
    } catch {
      toast.error('خطأ في جلب التفاصيل');
    }
  };

  const handleShowOrderDetails = async (customer: any) => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('customer_id', customer.id)
        .eq('created_by', effectiveWorkerId!)
        .gte('created_at', todayStart)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const hydratedItems = await hydrateOrderItems(data[0]);
        setOrderDetailsDialog({ ...data[0], items: hydratedItems, _isOrderRequest: true });
      } else {
        toast.error('لم يتم العثور على تفاصيل الطلبية');
      }
    } catch {
      toast.error('خطأ في جلب التفاصيل');
    }
  };

  const handleShowDirectSaleDetails = async (customer: any) => {
    const sale = todayDirectSales.find(s => s.customer_id === customer.id);
    if (sale) {
      setOrderDetailsDialog({ ...sale, _isDirectSale: true, customer });
    }
  };

  const hydrateOrderItems = async (order: any) => {
    const currentItems = Array.isArray(order?.items) ? order.items : [];
    if (currentItems.length > 0) return currentItems;

    if (order?.id) {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('*, product:products(*)')
        .eq('order_id', order.id);
      if (orderItems && orderItems.length > 0) return orderItems;

      const { data: receipt } = await supabase
        .from('receipts')
        .select('items')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (Array.isArray((receipt as any)?.items) && (receipt as any).items.length > 0) {
        return (receipt as any).items;
      }
    }

    return [];
  };

  const buildReceiptDataFromOrder = (order: any, isDirectSale: boolean) => {
    const customer = order.customer;
    const items = order.items || [];
    const totalAmount = Number(order.total_amount || 0);
    const isOrderRequest = !isDirectSale && !!order._isOrderRequest;
    const paidAmount = Number(order.paid_amount ?? order.paidAmount ?? (isOrderRequest ? 0 : totalAmount));
    const remainingAmount = Number(order.remaining_amount ?? order.remainingAmount ?? (isOrderRequest ? totalAmount : 0));

    return {
      receiptType: (isDirectSale ? 'direct_sale' : 'delivery') as any,
      orderId: order.id || null,
      customerId: customer?.id || '',
      customerName: customer?.store_name || customer?.name || order.customer_name || '—',
      customerPhone: customer?.phone || null,
      workerId: user?.id || '',
      workerName: user?.full_name || '',
      workerPhone: null,
      branchId: user?.branch_id || null,
      items: items.map((item: any) => ({
        productId: isDirectSale ? (item.product_id || '') : (item.product_id || item.product?.id || ''),
        productName: isDirectSale ? (item.productName || '—') : (item.product?.name || '—'),
        quantity: item.quantity || 0,
        unitPrice: isDirectSale ? (item.unitPrice || 0) : (item.unit_price || 0),
        totalPrice: isDirectSale ? (item.totalPrice || 0) : (item.total_price || 0),
        giftQuantity: isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0),
        giftPieces: isDirectSale ? (item.giftPieces || 0) : (item.gift_pieces || 0),
        piecesPerBox: isDirectSale ? (item.piecesPerBox || 0) : (item.pieces_per_box || item.product?.pieces_per_box || 0),
        pricingUnit: isDirectSale ? (item.pricingUnit || undefined) : (item.pricing_unit || item.product?.pricing_unit || undefined),
        weightPerBox: isDirectSale ? (item.weightPerBox || null) : (item.weight_per_box || item.product?.weight_per_box || null),
      })),
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentMethod: order.payment_type || order.paymentMethod || 'cash',
      notes: order.notes || null,
      receiptTitleOverride: !isDirectSale && order._isOrderRequest ? 'BON DE COMMANDE' : undefined,
    };
  };

  const handlePrintDeliveredOrder = async (customer: any) => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('customer_id', customer.id)
        .eq('status', 'delivered')
        .gte('updated_at', todayStart)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const hydratedItems = await hydrateOrderItems(data[0]);
        setPrintReceiptData(buildReceiptDataFromOrder({ ...data[0], items: hydratedItems }, false));
        setShowPrintReceipt(true);
      } else {
        toast.error('لم يتم العثور على الطلبية');
      }
    } catch { toast.error('خطأ في جلب البيانات'); }
  };

  const handlePrintDirectSale = (customer: any) => {
    const sale = todayDirectSales.find(s => s.customer_id === customer.id);
    if (sale) {
      setPrintReceiptData(buildReceiptDataFromOrder({ ...sale, _isDirectSale: true, customer }, true));
      setShowPrintReceipt(true);
    }
  };

  const handleDeliveryVisitWithoutDelivery = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'delivery_visit', notes: `زيارة توصيل بدون تسليم - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل زيارة بدون تسليم لـ ${customer.store_name || customer.name}`);
    } catch { toast.error('فشل في تسجيل الزيارة'); }
  };

  const handleVisitWithoutOrder = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `زيارة بدون طلبية - ${customer.name}` });
      toast.success(`تم تسجيل زيارة ${customer.name} بنجاح`);
    } catch { toast.error('فشل في تسجيل الزيارة'); }
  };

  const handleCustomerClosed = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `مغلق - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كمغلق`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleCustomerUnavailable = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `غير متاح - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كغير متاح`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleClosed = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `مغلق (بيع مباشر) - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كمغلق`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleUnavailable = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `غير متاح (بيع مباشر) - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كغير متاح`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleNoSale = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `بدون بيع - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" بدون بيع`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDeliveryDebtRefused = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `رفض الدين (توصيل) - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل رفض الدين لـ "${customer.store_name || customer.name}"`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleDebtRefused = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `رفض الدين (بيع مباشر) - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل رفض الدين لـ "${customer.store_name || customer.name}"`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDebtDebtRefused = async (debt: any) => {
    const customer = debt.customer as any;
    const customerObj = { id: debt.customer_id, latitude: customer?.latitude, longitude: customer?.longitude, store_name: customer?.store_name, name: customer?.name };
    const allowed = await checkLocationBeforeAction(customerObj);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: debt.customer_id, operationType: 'visit', notes: `رفض الدين (تحصيل دين) - ${customer?.store_name || customer?.name}` });
      toast.success(`تم تسجيل رفض الدين لـ "${customer?.store_name || customer?.name}"`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleClick = (customer: any) => {
    setDirectSaleCustomerId(customer.id);
    setShowDirectSale(true);
  };

  const handleDebtCustomerClosed = async (debt: any) => {
    const customer = debt.customer as any;
    const customerObj = { id: debt.customer_id, latitude: customer?.latitude, longitude: customer?.longitude, store_name: customer?.store_name, name: customer?.name };
    const allowed = await checkLocationBeforeAction(customerObj);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: debt.customer_id, operationType: 'visit', notes: `مغلق (تحصيل دين) - ${customer?.store_name || customer?.name}` });
      toast.success(`تم تسجيل "${customer?.store_name || customer?.name}" كمغلق`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDebtCustomerUnavailable = async (debt: any) => {
    const customer = debt.customer as any;
    const customerObj = { id: debt.customer_id, latitude: customer?.latitude, longitude: customer?.longitude, store_name: customer?.store_name, name: customer?.name };
    const allowed = await checkLocationBeforeAction(customerObj);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: debt.customer_id, operationType: 'visit', notes: `غير متاح (تحصيل دين) - ${customer?.store_name || customer?.name}` });
      toast.success(`تم تسجيل "${customer?.store_name || customer?.name}" كغير متاح`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleSalesCustomerClick = (customer: any) => {
    setSelectedCustomerForOrder(customer.id);
    setShowCreateOrder(true);
  };

  const handleDebtClick = (debt: any) => {
    setSelectedDebt(debt);
    setShowCollectDebt(true);
  };

  const handleVisitNoPayment = (debt: any) => {
    setSelectedDebt(debt);
    setShowVisitNoPayment(true);
  };

  const todaySectorNames = useMemo(() => {
    const allTodayIds = new Set([...todaySalesSectorIds, ...Array.from(todayDeliverySectorIds)]);
    return sectors.filter(s => allTodayIds.has(s.id)).map(s => s.name).join(' / ');
  }, [sectors, todaySalesSectorIds, todayDeliverySectorIds]);

  const dayLabel = DAY_NAMES[selectedDay] || selectedDay;
  const sectorSuffix = todaySectorNames ? ` — ${todaySectorNames}` : '';
  const title = effectiveWorkerName
    ? `عملاء اليوم — ${dayLabel} — ${effectiveWorkerName}${sectorSuffix}`
    : selectedAdminWorkerId && isAdmin
    ? `عملاء اليوم — ${dayLabel} — ${workersList.find(w => w.id === selectedAdminWorkerId)?.full_name || ''}${sectorSuffix}`
    : `عملاء اليوم — ${dayLabel}${sectorSuffix}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-0 gap-0 max-h-[85vh] flex flex-col" dir="rtl">
          <DialogHeader className="p-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{title}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Admin worker picker strip */}
          {isAdmin && !targetWorkerId && workersList.length > 0 && (
            <div className="border-b px-2 py-1.5 shrink-0">
              <ScrollArea className="w-full" dir="rtl">
                <div className="flex gap-1.5 pb-1">
                  {workersList.filter(w => availableWorkerIdsForSelectedDay.has(w.id)).map(w => {
                    const isSelected = w.id === selectedAdminWorkerId;
                    return (
                      <button
                        key={w.id}
                        onClick={() => setSelectedAdminWorkerId(isSelected ? null : w.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors shrink-0
                          ${isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border hover:bg-accent text-foreground'}
                        `}
                      >
                        <User className="w-3 h-3" />
                        {w.full_name}
                      </button>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}

          {/* Day picker strip */}
          <div className="border-b px-2 py-1.5 shrink-0">
            <ScrollArea className="w-full" dir="rtl">
              <div className="flex gap-1.5 pb-1">
                {Object.entries(DAY_NAMES).map(([key, label]) => {
                  const isSelected = key === selectedDay;
                  const isToday = key === todayName;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors shrink-0
                        ${isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-accent text-foreground'}
                      `}
                    >
                      {label}
                      {isToday && !isSelected && <span className="mr-0.5 text-[9px] text-primary">●</span>}
                    </button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          <div className="px-3 pt-2 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pr-8"
                dir="rtl"
              />
            </div>
          </div>

          <Tabs defaultValue="sales" className="flex flex-col flex-1 min-h-0">
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
              <TabsTrigger value="direct-sale" className="flex-1 gap-1 text-xs">
                <ShoppingBag className="w-3.5 h-3.5" />
                بيع مباشر
                {directSaleCustomers.length > 0 && <Badge className="text-[10px] px-1 bg-emerald-500">{directSaleCustomers.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="debts" className="flex-1 gap-1 text-xs">
                <Landmark className="w-3.5 h-3.5" />
                ديون
                {debtCustomers.length > 0 && <Badge variant="destructive" className="text-[10px] px-1">{debtCustomers.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Delivery Tab */}
            <TabsContent value="delivery" className="m-0 flex-1 min-h-0">
              <Tabs defaultValue="not-delivered" className="flex flex-col h-full min-h-0">
                <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                  <TabsTrigger value="not-delivered" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                    <Truck className="w-3 h-3" />
                    بدون توصيل
                    {deliveryNotDone.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{deliveryNotDone.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="not-received" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                    <PackageX className="w-3 h-3" />
                    بدون تسليم
                    {deliveryNotReceived.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{deliveryNotReceived.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="received" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                    <PackageCheck className="w-3 h-3" />
                    تم الاستلام
                    {deliveryReceived.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{deliveryReceived.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="not-delivered" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={deliveryNotDone} emptyMessage="تم توصيل جميع العملاء ✓" onCustomerClick={handleDeliveryCustomerClick} onVisitWithoutOrder={handleDeliveryVisitWithoutDelivery} onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} onDebtRefused={handleDeliveryDebtRefused} showVisitButton visitButtonLabel="بدون تسليم" showActionButtons checkingLocationFor={checkingLocationFor} loadingFor={loadingDeliveryFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} />
                </TabsContent>
                <TabsContent value="not-received" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={deliveryNotReceived} emptyMessage="لا توجد زيارات بدون تسليم" onCustomerClick={handleDeliveryCustomerClick} showActionButtons onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} onDebtRefused={handleDeliveryDebtRefused} checkingLocationFor={checkingLocationFor} loadingFor={loadingDeliveryFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={visitTimeMap} distanceMap={customerDistanceMap} />
                </TabsContent>
                <TabsContent value="received" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={deliveryReceived} emptyMessage="لا توجد توصيلات بعد" onCustomerClick={handleShowDeliveredOrderDetails} showPrintButton onPrint={handlePrintDeliveredOrder} checkingLocationFor={checkingLocationFor} loadingFor={loadingDeliveryFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} deliveryTimeMap={customerDeliveryTimeMap} timeMap={customerDeliveryTimeMap} distanceMap={customerDistanceMap} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Sales Tab */}
            <TabsContent value="sales" className="m-0 flex-1 min-h-0">
              <Tabs defaultValue="not-visited" className="flex flex-col h-full min-h-0">
                <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                  <TabsTrigger value="not-visited" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                    <EyeOff className="w-3 h-3" />
                    بدون زيارة
                    {salesNotVisited.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{salesNotVisited.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="visited-no-order" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                    <Eye className="w-3 h-3" />
                    بدون طلبية
                    {salesVisitedNoOrder.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{salesVisitedNoOrder.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="with-orders" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                    <CheckCircle className="w-3 h-3" />
                    تم الطلب
                    {salesWithOrders.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{salesWithOrders.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="not-visited" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={salesNotVisited} emptyMessage="تمت زيارة جميع العملاء ✓" onCustomerClick={handleSalesCustomerClick} onVisitWithoutOrder={handleVisitWithoutOrder} onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} showVisitButton showActionButtons checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} />
                </TabsContent>
                <TabsContent value="visited-no-order" className="m-0 flex-1 min-h-0">
                  <Tabs defaultValue="visit-only" className="flex flex-col h-full min-h-0">
                    <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5 bg-amber-50">
                      <TabsTrigger value="visit-only" className="flex-1 gap-1 text-[10px] px-1 py-1 data-[state=active]:bg-amber-200 data-[state=active]:text-amber-800">
                        <Eye className="w-3 h-3" />
                        زيارة
                        {salesVisitedOnly.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{salesVisitedOnly.length}</Badge>}
                      </TabsTrigger>
                      <TabsTrigger value="unavailable" className="flex-1 gap-1 text-[10px] px-1 py-1 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-800">
                        <UserX className="w-3 h-3" />
                        غير متاح
                        {salesUnavailable.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-yellow-500">{salesUnavailable.length}</Badge>}
                      </TabsTrigger>
                      <TabsTrigger value="closed" className="flex-1 gap-1 text-[10px] px-1 py-1 data-[state=active]:bg-red-100 data-[state=active]:text-red-700">
                        <DoorClosed className="w-3 h-3" />
                        مغلق
                        {salesClosed.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-red-500">{salesClosed.length}</Badge>}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="visit-only" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '50vh' }}>
                      <CustomerList customers={salesVisitedOnly} emptyMessage="لا توجد زيارات بدون طلبيات" onCustomerClick={handleSalesCustomerClick} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={visitTimeMap} distanceMap={customerDistanceMap} />
                    </TabsContent>
                    <TabsContent value="unavailable" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '50vh' }}>
                      <CustomerList customers={salesUnavailable} emptyMessage="لا يوجد عملاء غير متاحين" onCustomerClick={handleSalesCustomerClick} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={visitTimeMap} distanceMap={customerDistanceMap} />
                    </TabsContent>
                    <TabsContent value="closed" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '50vh' }}>
                      <CustomerList customers={salesClosed} emptyMessage="لا يوجد عملاء مغلقين" onCustomerClick={handleSalesCustomerClick} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={visitTimeMap} distanceMap={customerDistanceMap} />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                <TabsContent value="with-orders" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={salesWithOrders} emptyMessage="لا توجد طلبيات بعد" onCustomerClick={handleShowOrderDetails} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={orderTimeMap} distanceMap={customerDistanceMap} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Direct Sale Tab */}
            <TabsContent value="direct-sale" className="m-0 flex-1 min-h-0">
              <Tabs defaultValue="pending" className="flex flex-col h-full min-h-0">
                <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                  <TabsTrigger value="pending" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                    <ShoppingBag className="w-3 h-3" />
                    العملاء
                    {directSalePending.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{directSalePending.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="sold" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                    <CheckCircle className="w-3 h-3" />
                    تم البيع
                    {directSaleSold.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{directSaleSold.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="no-sale" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                    <XCircle className="w-3 h-3" />
                    بدون بيع
                    {directSaleNoSale.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{directSaleNoSale.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={directSalePending} emptyMessage="لا توجد محلات متاحة للبيع المباشر" onCustomerClick={handleDirectSaleClick} onClosed={handleDirectSaleClosed} onUnavailable={handleDirectSaleUnavailable} onDebtRefused={handleDirectSaleDebtRefused} onNoSale={handleDirectSaleNoSale} showActionButtons showNoSaleButton checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} salesRepStatusMap={salesRepStatusMap} />
                </TabsContent>
                <TabsContent value="sold" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={directSaleSold} emptyMessage="لا توجد مبيعات بعد" onCustomerClick={handleShowDirectSaleDetails} showPrintButton onPrint={handlePrintDirectSale} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={directSaleTimeMap} distanceMap={customerDistanceMap} />
                </TabsContent>
                <TabsContent value="no-sale" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <CustomerList customers={directSaleNoSale} emptyMessage="لا توجد زيارات بدون بيع" onCustomerClick={handleDirectSaleClick} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} sectors={sectors} allZones={allZones} timeMap={visitTimeMap} distanceMap={customerDistanceMap} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Debts Tab */}
            <TabsContent value="debts" className="m-0 flex-1 min-h-0">
              <Tabs defaultValue="today-collection" className="flex flex-col h-full min-h-0">
                <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                  <TabsTrigger value="today-collection" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                    <Clock className="w-3 h-3" />
                    تحصيل اليوم
                    {debtsToCollectToday.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{debtsToCollectToday.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="collected" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                    <Check className="w-3 h-3" />
                    تم التحصيل
                    {debtsCollectedToday.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{debtsCollectedToday.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="no-payment" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                    <X className="w-3 h-3" />
                    بدون تحصيل
                    {debtsNoPaymentToday.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{debtsNoPaymentToday.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="all-debts" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                    <Landmark className="w-3 h-3" />
                    الكل
                    {allDebtsFiltered.length > 0 && <Badge variant="secondary" className="text-[9px] px-1 h-4">{allDebtsFiltered.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="today-collection" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <DebtList debts={debtsToCollectToday} onCollect={handleDebtClick} onVisitNoPayment={handleVisitNoPayment} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} onDebtRefused={handleDebtDebtRefused} emptyMessage="لا توجد ديون مستحقة اليوم ✓" searchQuery={searchQuery} />
                </TabsContent>
                <TabsContent value="collected" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <DebtList debts={debtsCollectedToday} onCollect={handleDebtClick} onVisitNoPayment={handleVisitNoPayment} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} onDebtRefused={handleDebtDebtRefused} emptyMessage="لا توجد تحصيلات بعد" searchQuery={searchQuery} timeMap={debtCollectionTimeMap} />
                </TabsContent>
                <TabsContent value="no-payment" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <DebtList debts={debtsNoPaymentToday} onCollect={handleDebtClick} onVisitNoPayment={handleVisitNoPayment} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} onDebtRefused={handleDebtDebtRefused} emptyMessage="لا توجد زيارات بدون دفع" searchQuery={searchQuery} timeMap={debtCollectionTimeMap} />
                </TabsContent>
                <TabsContent value="all-debts" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '55vh' }}>
                  <DebtList debts={allDebtsFiltered} onCollect={handleDebtClick} onVisitNoPayment={handleVisitNoPayment} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} onDebtRefused={handleDebtDebtRefused} emptyMessage="لا توجد ديون مستحقة" searchQuery={searchQuery} />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      {orderDetailsDialog && (
        <OrderDetailsDialog
          order={orderDetailsDialog}
          onClose={() => setOrderDetailsDialog(null)}
        />
      )}

      {/* Sub-dialogs */}
      {pendingDeliveryOrder && (
        <DeliverySaleDialog
          open={showDeliveryDialog}
          onOpenChange={(o) => { setShowDeliveryDialog(o); if (!o) setPendingDeliveryOrder(null); }}
          order={pendingDeliveryOrder}
        />
      )}

      <CreateOrderDialog
        open={showCreateOrder}
        onOpenChange={setShowCreateOrder}
        initialCustomerId={selectedCustomerForOrder || undefined}
      />

      <DirectSaleDialog
        open={showDirectSale}
        onOpenChange={(o) => { setShowDirectSale(o); if (!o) setDirectSaleCustomerId(null); }}
        stockItems={workerStock}
        initialCustomerId={directSaleCustomerId || undefined}
      />

      {selectedDebt && (
        <VisitNoPaymentDialog
          open={showVisitNoPayment}
          onOpenChange={(o) => { setShowVisitNoPayment(o); if (!o) setSelectedDebt(null); }}
          debtId={selectedDebt.id}
          customerName={(selectedDebt.customer as any)?.store_name || (selectedDebt.customer as any)?.name || ''}
          collectionType={selectedDebt.collection_type}
          collectionDays={selectedDebt.collection_days}
          customerLatitude={(selectedDebt.customer as any)?.latitude}
          customerLongitude={(selectedDebt.customer as any)?.longitude}
        />
      )}

      {selectedDebt && (
        <CollectDebtDialog
          open={showCollectDebt}
          onOpenChange={(o) => { setShowCollectDebt(o); if (!o) setSelectedDebt(null); }}
          debtId={selectedDebt.id}
          customerName={(selectedDebt.customer as any)?.store_name || (selectedDebt.customer as any)?.name || ''}
          totalDebtAmount={Number(selectedDebt.total_amount)}
          paidAmountBefore={Number(selectedDebt.paid_amount)}
          remainingAmount={Number(selectedDebt.remaining_amount)}
          customerId={selectedDebt.customer_id}
          customerPhone={(selectedDebt.customer as any)?.phone || null}
          defaultAmount={selectedDebt.collection_amount ? Number(selectedDebt.collection_amount) : undefined}
          collectionType={selectedDebt.collection_type}
          collectionDays={selectedDebt.collection_days}
        />
      )}

      {/* Print Receipt Dialog */}
      {printReceiptData && (
        <ReceiptDialog
          open={showPrintReceipt}
          onOpenChange={(o) => { setShowPrintReceipt(o); if (!o) setPrintReceiptData(null); }}
          receiptData={printReceiptData}
        />
      )}
    </>
  );
};

// Order Details Dialog - shows order/sale details similar to receipt content
const OrderDetailsDialog: React.FC<{ order: any; onClose: () => void }> = ({ order, onClose }) => {
  const { user } = useAuth();
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showModifyDialog, setShowModifyDialog] = useState(false);
  const { data: modifyOrderItems } = useOrderItems(showModifyDialog ? order.id : null);
  const isDirectSale = order._isDirectSale;
  const items = isDirectSale ? (order.items || []) : (order.items || []);
  const customer = isDirectSale ? order.customer : order.customer;
  const totalAmount = Number(order.total_amount || 0);
  const isOrderRequest = !isDirectSale && !!order._isOrderRequest;
  const paidAmount = Number(order.paid_amount ?? order.paidAmount ?? (isOrderRequest ? 0 : totalAmount));
  const remainingAmount = Number(order.remaining_amount ?? order.remainingAmount ?? (isOrderRequest ? totalAmount : 0));

  const handlePrint = () => {
    const receiptItems: ReceiptItem[] = items.map((item: any) => ({
      productId: isDirectSale ? (item.product_id || '') : (item.product_id || item.product?.id || ''),
      productName: isDirectSale ? (item.productName || '—') : (item.product?.name || '—'),
      quantity: item.quantity || 0,
      unitPrice: isDirectSale ? (item.unitPrice || 0) : (item.unit_price || 0),
      totalPrice: isDirectSale ? (item.totalPrice || 0) : (item.total_price || 0),
      giftQuantity: isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0),
    }));

    setShowReceiptDialog(true);
  };

  const receiptData = {
    receiptType: (isDirectSale ? 'direct_sale' : 'delivery') as any,
    orderId: order.id || null,
    customerId: customer?.id || '',
    customerName: customer?.store_name || customer?.name || order.customer_name || '—',
    customerPhone: customer?.phone || null,
    workerId: user?.id || '',
    workerName: user?.full_name || '',
    workerPhone: null,
    branchId: user?.branch_id || null,
    items: items.map((item: any) => ({
      productId: isDirectSale ? (item.product_id || '') : (item.product_id || item.product?.id || ''),
      productName: isDirectSale ? (item.productName || '—') : (item.product?.name || '—'),
      quantity: item.quantity || 0,
      unitPrice: isDirectSale ? (item.unitPrice || 0) : (item.unit_price || 0),
      totalPrice: isDirectSale ? (item.totalPrice || 0) : (item.total_price || 0),
      giftQuantity: isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0),
    })),
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentMethod: order.payment_type || order.paymentMethod || 'cash',
    notes: order.notes || null,
    receiptTitleOverride: !isDirectSale && order._isOrderRequest ? 'BON DE COMMANDE' : undefined,
  };

  return (
    <>
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3 max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isDirectSale ? '🛒 تفاصيل البيع المباشر' : '📦 تفاصيل الطلبية'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Customer Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <CustomerLabel customer={{ name: customer?.name, store_name: customer?.store_name, customer_type: customer?.customer_type }} compact />
            </div>
            {customer?.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" />
                <span>{customer.phone}</span>
              </div>
            )}
            {order.created_at && (
              <p className="text-xs text-muted-foreground">
                التاريخ: {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}
              </p>
            )}
          </div>

          {/* Items */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 px-3 py-2 text-xs font-bold border-b">المنتجات</div>
            <div className="divide-y">
              {items.map((item: any, idx: number) => {
                const productName = isDirectSale ? (item.productName || '—') : (item.product?.name || '—');
                const quantity = isDirectSale ? item.quantity : item.quantity;
                const unitPrice = isDirectSale ? item.unitPrice : item.unit_price;
                const itemTotal = isDirectSale ? item.totalPrice : item.total_price;
                const giftQty = isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0);

                return (
                  <div key={idx} className="px-3 py-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{productName}</span>
                      <span className="font-bold text-sm">{Number(itemTotal || 0).toLocaleString()} DA</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>الكمية: {quantity}</span>
                      <span>السعر: {Number(unitPrice || 0).toLocaleString()} DA</span>
                      {giftQty > 0 && <span className="text-emerald-600">🎁 عرض: {giftQty}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total */}
          <div className="bg-primary/5 rounded-lg p-3 flex items-center justify-between">
            <span className="font-bold">المجموع</span>
            <span className="font-bold text-lg text-primary">{Number(totalAmount || 0).toLocaleString()} DA</span>
          </div>

          {!isDirectSale && order.notes && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
              ملاحظات: {order.notes}
            </div>
          )}

          {/* Edit & Print Buttons */}
          {order.id && !isDirectSale && (
            <Button className="w-full gap-2" variant="default" onClick={() => setShowModifyDialog(true)}>
              <Pencil className="w-4 h-4" />
              تعديل الطلبية
            </Button>
          )}
          <Button className="w-full gap-2" variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            طباعة الوصل
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ReceiptDialog
      open={showReceiptDialog}
      onOpenChange={setShowReceiptDialog}
      receiptData={receiptData}
    />

    {showModifyDialog && modifyOrderItems && (
      <ModifyOrderDialog
        open={showModifyDialog}
        onOpenChange={(o) => { setShowModifyDialog(o); if (!o) onClose(); }}
        order={order}
        orderItems={modifyOrderItems}
      />
    )}
    </>
  );
};

// Reusable CustomerList component
const CustomerList: React.FC<{
  customers: any[];
  emptyMessage: string;
  onCustomerClick: (c: any) => void;
  onVisitWithoutOrder?: (c: any) => void;
  onClosed?: (c: any) => void;
  onUnavailable?: (c: any) => void;
  onDebtRefused?: (c: any) => void;
  onNoSale?: (c: any) => void;
  onPrint?: (c: any) => void;
  showVisitButton?: boolean;
  visitButtonLabel?: string;
  showActionButtons?: boolean;
  showPrintButton?: boolean;
  showNoSaleButton?: boolean;
  checkingLocationFor: string | null;
  loadingFor?: string | null;
  searchQuery?: string;
  sectors?: any[];
  allZones?: any[];
  salesRepStatusMap?: Map<string, string>;
  deliveryTimeMap?: Map<string, string>;
  timeMap?: Map<string, string>;
  distanceMap?: Map<string, number>;
}> = ({ customers, emptyMessage, onCustomerClick, onVisitWithoutOrder, onClosed, onUnavailable, onDebtRefused, onNoSale, onPrint, showVisitButton, visitButtonLabel, showActionButtons, showPrintButton, showNoSaleButton, checkingLocationFor, loadingFor, searchQuery, sectors, allZones, salesRepStatusMap, deliveryTimeMap, timeMap, distanceMap }) => {
  const { language } = useLanguage();
  const filtered = useMemo(() => {
    let list = customers;
    if (searchQuery?.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.store_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }
    // Sort by timeMap descending (newest first) if available
    if (timeMap && timeMap.size > 0) {
      list = [...list].sort((a, b) => {
        const tA = timeMap.get(a.id) || '';
        const tB = timeMap.get(b.id) || '';
        return tB.localeCompare(tA);
      });
    }
    return list;
  }, [customers, searchQuery, timeMap]);

  // Group by zone
  const zoneGroups = useMemo(() => {
    const groups = new Map<string | null, any[]>();
    filtered.forEach(c => {
      const key = c.zone_id || null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      const nameA = allZones?.find(z => z.id === a)?.name || '';
      const nameB = allZones?.find(z => z.id === b)?.name || '';
      return nameA.localeCompare(nameB, 'ar');
    });
    return sortedKeys.map(key => ({
      zoneId: key,
      zoneName: key ? (allZones?.find(z => z.id === key) ? getLocalizedName(allZones.find(z => z.id === key)!, language) : 'منطقة غير معروفة') : 'بدون منطقة',
      customers: groups.get(key)!,
    }));
  }, [filtered, allZones, language]);

  if (filtered.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{searchQuery?.trim() ? 'لا توجد نتائج' : emptyMessage}</div>;
  }

  const renderCustomer = (c: any) => {
    const sector = sectors?.find(s => s.id === c.sector_id);
    const zone = allZones?.find(z => z.id === c.zone_id);
    return (
      <div key={c.id} className="p-3 hover:bg-muted/50 transition-colors">
        <button
          className="w-full flex items-center gap-2 text-start"
          onClick={() => onCustomerClick(c)}
          disabled={loadingFor === c.id}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {loadingFor === c.id ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <User className="w-4 h-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <CustomerLabel
              customer={{
                name: c.name,
                store_name: c.store_name,
                customer_type: c.customer_type,
                sector_name: sector ? getLocalizedName(sector, language) : undefined,
                zone_name: zone ? getLocalizedName(zone, language) : undefined,
              }}
             />
             {salesRepStatusMap && salesRepStatusMap.has(c.id) && (() => {
               const status = salesRepStatusMap.get(c.id);
               if (status === 'not_visited') return <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-0">بدون زيارة</Badge>;
               if (status === 'closed') return <Badge className="text-[9px] px-1.5 py-0 h-4 bg-red-100 text-red-700 border-0">مغلق</Badge>;
               if (status === 'unavailable') return <Badge className="text-[9px] px-1.5 py-0 h-4 bg-gray-100 text-gray-600 border-0">غير متاح</Badge>;
               if (status === 'visited') return <Badge className="text-[9px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-0">تمت الزيارة</Badge>;
               return null;
             })()}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {c.phone && <span>{c.phone}</span>}
              {distanceMap?.has(c.id) ? (
                <span>• 📍 {distanceMap.get(c.id)!} م</span>
              ) : c.wilaya ? (
                <span>• {c.wilaya}</span>
              ) : null}
              {timeMap?.has(c.id) && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  <Clock className="w-3 h-3" />
                  {format(new Date(timeMap.get(c.id)!), 'HH:mm')}
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1 mt-1.5 justify-end flex-wrap">
          {c.latitude && c.longitude && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`, '_blank')}>
              <Navigation className="w-3 h-3" />
              الموقع
            </Button>
          )}
          {showPrintButton && onPrint && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={(e) => { e.stopPropagation(); onPrint(c); }}>
              <Printer className="w-3.5 h-3.5" />
            </Button>
          )}
          {showVisitButton && onVisitWithoutOrder && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-orange-600" onClick={() => onVisitWithoutOrder(c)} disabled={checkingLocationFor === c.id}>
              {checkingLocationFor === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPinOff className="w-3 h-3" />}
              {visitButtonLabel || 'زيارة بدون طلبية'}
            </Button>
          )}
          {showNoSaleButton && onNoSale && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-amber-600" onClick={() => onNoSale(c)} disabled={checkingLocationFor === c.id}>
              {checkingLocationFor === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              بدون بيع
            </Button>
          )}
          {showActionButtons && onClosed && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-destructive" onClick={() => onClosed(c)} disabled={checkingLocationFor === c.id}>
              <DoorClosed className="w-3 h-3" />
              مغلق
            </Button>
          )}
          {showActionButtons && onUnavailable && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-muted-foreground" onClick={() => onUnavailable(c)} disabled={checkingLocationFor === c.id}>
              <UserX className="w-3 h-3" />
              غير متاح
            </Button>
          )}
          {showActionButtons && onDebtRefused && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-purple-600" onClick={() => onDebtRefused(c)} disabled={checkingLocationFor === c.id}>
              <BanknoteIcon className="w-3 h-3" />
              رفض الدين
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {zoneGroups.length <= 1 ? (
        <div className="divide-y">
          {filtered.map(renderCustomer)}
        </div>
      ) : (
        zoneGroups.map(group => (
          <div key={group.zoneId || 'no-zone'}>
            <div className="sticky top-0 z-10 bg-blue-600 text-white px-4 py-1.5 text-xs font-bold flex items-center justify-between">
              <span>{group.zoneName}</span>
              <Badge className="bg-white/20 text-white border-0 text-[10px]">{group.customers.length}</Badge>
            </div>
            <div className="divide-y">
              {group.customers.map(renderCustomer)}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// Reusable DebtList component
const DebtList: React.FC<{ debts: DueDebt[]; onCollect: (d: DueDebt) => void; onVisitNoPayment: (d: DueDebt) => void; onClosed: (d: DueDebt) => void; onUnavailable: (d: DueDebt) => void; onDebtRefused?: (d: DueDebt) => void; emptyMessage: string; searchQuery?: string; timeMap?: Map<string, string> }> = ({ debts, onCollect, onVisitNoPayment, onClosed, onUnavailable, onDebtRefused, emptyMessage, searchQuery, timeMap }) => {
  const filtered = useMemo(() => {
    let list = debts;
    if (searchQuery?.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(d => {
        const cust = d.customer as any;
        return (cust?.name || '').toLowerCase().includes(q) ||
          (cust?.store_name || '').toLowerCase().includes(q) ||
          (cust?.phone || '').includes(q);
      });
    }
    if (timeMap && timeMap.size > 0) {
      list = [...list].sort((a, b) => {
        const tA = timeMap.get(a.id) || '';
        const tB = timeMap.get(b.id) || '';
        return tB.localeCompare(tA);
      });
    }
    return list;
  }, [debts, searchQuery, timeMap]);

  if (filtered.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{searchQuery?.trim() ? 'لا توجد نتائج' : emptyMessage}</div>;
  }

  return (
    <div className="divide-y">
      {filtered.map(debt => (
        <div key={debt.id} className="p-3 hover:bg-muted/50 transition-colors">
          <button className="w-full text-right" onClick={() => onCollect(debt)}>
            <div className="flex items-center justify-between">
              <CustomerLabel customer={{ name: (debt.customer as any)?.name, store_name: (debt.customer as any)?.store_name, customer_type: (debt.customer as any)?.customer_type }} compact hideBadges />
              <span className="text-destructive font-bold">{Number(debt.remaining_amount).toLocaleString()} DA</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{debt.due_date ? format(new Date(debt.due_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}</span>
              {(debt.customer as any)?.phone && <span>• {(debt.customer as any).phone}</span>}
              {timeMap?.has(debt.id) && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  ⏰ {format(new Date(timeMap.get(debt.id)!), 'HH:mm')}
                </span>
              )}
            </div>
          </button>
          <div className="flex items-center gap-1 mt-1.5 justify-end flex-wrap">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-orange-600" onClick={(e) => { e.stopPropagation(); onVisitNoPayment(debt); }}>
              <Eye className="w-3 h-3" />
              زيارة بدون دفع
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-green-600" onClick={(e) => { e.stopPropagation(); onCollect(debt); }}>
              <Landmark className="w-3 h-3" />
              تحصيل
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-red-600" onClick={(e) => { e.stopPropagation(); onClosed(debt); }}>
              <DoorClosed className="w-3 h-3" />
              مغلق
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-gray-600" onClick={(e) => { e.stopPropagation(); onUnavailable(debt); }}>
              <UserX className="w-3 h-3" />
              غير متاح
            </Button>
            {onDebtRefused && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-purple-600" onClick={(e) => { e.stopPropagation(); onDebtRefused(debt); }}>
                <BanknoteIcon className="w-3 h-3" />
                رفض الدين
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TodayCustomersDialog;
