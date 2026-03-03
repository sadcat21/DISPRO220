import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';

export type OperationType = 'order' | 'direct_sale' | 'delivery' | 'add_customer' | 'update_customer' | 'delete_customer' | 'debt_collection' | 'visit' | 'delivery_visit';

export interface VisitRecord {
  id: string;
  worker_id: string;
  customer_id: string | null;
  branch_id: string | null;
  operation_type: OperationType;
  operation_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  worker_name?: string;
  customer_name?: string;
}

const OPERATION_LABELS: Record<OperationType, string> = {
  order: 'طلبية',
  direct_sale: 'بيع مباشر',
  delivery: 'توصيل',
  add_customer: 'طلب إضافة عميل',
  update_customer: 'طلب تعديل زبون',
  delete_customer: 'طلب حذف زبون',
  debt_collection: 'تحصيل دين',
  visit: 'زيارة',
  delivery_visit: 'زيارة بدون تسليم',
};

export const getOperationLabel = (type: OperationType) => OPERATION_LABELS[type] || type;

// Track a visit - always records the operation even without GPS
export const useTrackVisit = () => {
  const { workerId, activeBranch } = useAuth();

  const trackVisit = useCallback(async (params: {
    customerId?: string | null;
    operationType: OperationType;
    operationId?: string | null;
    notes?: string | null;
  }) => {
    if (!workerId) return;

    // Try to get GPS location, but don't block if it fails
    let lat: number | null = null;
    let lng: number | null = null;
    let accuracy: number | null = null;

    try {
      if (navigator.geolocation) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 120000,
          });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        accuracy = position.coords.accuracy;
      }
    } catch {
      // GPS failed or denied - still record the operation without coordinates
    }

    try {
      await supabase.from('visit_tracking').insert({
        worker_id: workerId,
        customer_id: params.customerId || null,
        branch_id: activeBranch?.id || null,
        operation_type: params.operationType,
        operation_id: params.operationId || null,
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        notes: params.notes || null,
      });
    } catch (err) {
      console.warn('Visit tracking insert failed:', err);
    }
  }, [workerId, activeBranch]);

  return { trackVisit };
};

// Fetch visits for admin view
export const useVisitTrackingList = (filters?: {
  dateFrom?: string;
  dateTo?: string;
  workerId?: string;
  operationType?: string;
}) => {
  const { activeBranch, role } = useAuth();
  const isAdmin = role === 'admin' || role === 'branch_admin';

  useRealtimeSubscription(
    `visit-tracking-realtime-${activeBranch?.id || 'all'}`,
    [{ table: 'visit_tracking' }, { table: 'worker_locations' }],
    [['visit-tracking', activeBranch?.id]],
    isAdmin
  );

  return useQuery({
    queryKey: ['visit-tracking', activeBranch?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('visit_tracking')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      // Admin sees ALL operations (no branch filter)
      // Branch admin sees only their branch
      if (role === 'branch_admin' && activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom + 'T00:00:00');
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }
      if (filters?.workerId && filters.workerId !== 'all') {
        query = query.eq('worker_id', filters.workerId);
      }
      if (filters?.operationType && filters.operationType !== 'all') {
        query = query.eq('operation_type', filters.operationType);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch worker and customer names
      const workerIds = [...new Set((data || []).map(v => v.worker_id))];
      const customerIds = [...new Set((data || []).filter(v => v.customer_id).map(v => v.customer_id!))];

      const [workersRes, customersRes] = await Promise.all([
        workerIds.length > 0
          ? supabase.from('workers_safe').select('id, full_name').in('id', workerIds)
          : { data: [] },
        customerIds.length > 0
          ? supabase.from('customers').select('id, name').in('id', customerIds)
          : { data: [] },
      ]);

      const workerMap = new Map((workersRes.data || []).map(w => [w.id, w.full_name]));
      const customerMap = new Map((customersRes.data || []).map(c => [c.id, c.name]));

      return (data || []).map(v => ({
        ...v,
        worker_name: workerMap.get(v.worker_id) || '',
        customer_name: v.customer_id ? customerMap.get(v.customer_id) || '' : '',
      })) as VisitRecord[];
    },
    enabled: isAdmin,
  });
};
