import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/utils';

export interface SectorCoverage {
  id: string;
  sector_id: string;
  absent_worker_id: string;
  substitute_worker_id: string;
  coverage_type: 'full' | 'split';
  coverage_mode: 'merge' | 'replace';
  schedule_type: 'sales' | 'delivery';
  start_date: string;
  end_date: string;
  reason: string | null;
  created_by: string | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useSectorCoverage = () => {
  const { activeBranch, workerId, role } = useAuth();
  const [coverages, setCoverages] = useState<SectorCoverage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const transferOrdersFromAbsentToSubstitute = useCallback(async (
    absentWorkerId: string,
    substituteWorkerId: string,
    sectorId: string
  ) => {
    const { data: sectorCustomers, error: customersError } = await supabase
      .from('customers')
      .select('id')
      .eq('sector_id', sectorId);

    if (customersError) throw customersError;

    const customerIds = (sectorCustomers || []).map((c) => c.id);
    if (customerIds.length === 0) return 0;

    const { data: pendingOrders, error: pendingOrdersError } = await supabase
      .from('orders')
      .select('id')
      .eq('assigned_worker_id', absentWorkerId)
      .in('customer_id', customerIds)
      .in('status', ['pending', 'assigned', 'in_progress']);

    if (pendingOrdersError) throw pendingOrdersError;
    if (!pendingOrders || pendingOrders.length === 0) return 0;

    const orderIds = pendingOrders.map((o) => o.id);

    const { error: updateError } = await supabase
      .from('orders')
      .update({ assigned_worker_id: substituteWorkerId })
      .in('id', orderIds);

    if (updateError) throw updateError;

    return orderIds.length;
  }, []);

  const fetchCoverages = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('sector_coverage')
        .select('*')
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString().split('T')[0])
        .order('start_date');

      if (activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const activeCoverages = (data || []) as SectorCoverage[];
      setCoverages(activeCoverages);

      const coveragesToReconcile = activeCoverages.filter((coverage) =>
        isAdminRole(role) || coverage.absent_worker_id === workerId
      );

      await Promise.all(
        coveragesToReconcile.map(async (coverage) => {
          try {
            await transferOrdersFromAbsentToSubstitute(
              coverage.absent_worker_id,
              coverage.substitute_worker_id,
              coverage.sector_id
            );
          } catch (reconcileError) {
            console.error('Error reconciling coverage orders:', reconcileError);
          }
        })
      );
    } catch (error) {
      console.error('Error fetching sector coverage:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeBranch?.id, role, transferOrdersFromAbsentToSubstitute, workerId]);

  useEffect(() => {
    fetchCoverages();
  }, [fetchCoverages]);

  // Realtime
  useEffect(() => {
    const baseChannelName = 'sector-coverage-realtime';
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sector_coverage' }, () => {
        fetchCoverages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCoverages]);

  const createCoverage = async (data: {
    sector_id: string;
    absent_worker_id: string;
    substitute_worker_id: string;
    coverage_type: 'full' | 'split';
    coverage_mode?: 'merge' | 'replace';
    schedule_type: 'sales' | 'delivery';
    start_date: string;
    end_date: string;
    reason?: string;
    created_by?: string;
    branch_id?: string;
  }) => {
    const { error } = await supabase.from('sector_coverage').insert({
      sector_id: data.sector_id,
      absent_worker_id: data.absent_worker_id,
      substitute_worker_id: data.substitute_worker_id,
      coverage_type: data.coverage_type,
      coverage_mode: data.coverage_mode || 'merge',
      schedule_type: data.schedule_type,
      start_date: data.start_date,
      end_date: data.end_date,
      reason: data.reason || null,
      created_by: data.created_by || null,
      branch_id: data.branch_id || null,
    } as any);
    if (error) throw error;

    const movedOrdersCount = await transferOrdersFromAbsentToSubstitute(
      data.absent_worker_id,
      data.substitute_worker_id,
      data.sector_id
    );

    if (movedOrdersCount > 0) {
      console.log(`تم نقل ${movedOrdersCount} طلبية من العامل الغائب إلى العامل البديل`);
    }

    await fetchCoverages();
  };

  const cancelCoverage = async (coverageId: string) => {
    const { error } = await supabase
      .from('sector_coverage')
      .update({ is_active: false } as any)
      .eq('id', coverageId);
    if (error) throw error;
    await fetchCoverages();
  };

  // Get active coverages for a specific date
  const getActiveCoveragesForDate = useCallback((date: string) => {
    return coverages.filter(c => c.start_date <= date && c.end_date >= date && c.is_active);
  }, [coverages]);

  // Get substitute worker for a sector on a date
  const getSubstituteForSector = useCallback((sectorId: string, scheduleType: 'sales' | 'delivery', date: string) => {
    return coverages.filter(
      c => c.sector_id === sectorId && c.schedule_type === scheduleType && c.start_date <= date && c.end_date >= date && c.is_active
    );
  }, [coverages]);

  // Get all sectors a substitute worker is covering on a date
  const getCoveredSectorsForWorker = useCallback((workerId: string, scheduleType: 'sales' | 'delivery', date: string) => {
    return coverages.filter(
      c => c.substitute_worker_id === workerId && c.schedule_type === scheduleType && c.start_date <= date && c.end_date >= date && c.is_active
    );
  }, [coverages]);

  // Check if a worker is absent (has coverage records as absent_worker)
  const isWorkerAbsent = useCallback((workerId: string, date: string) => {
    return coverages.some(
      c => c.absent_worker_id === workerId && c.start_date <= date && c.end_date >= date && c.is_active
    );
  }, [coverages]);

  return {
    coverages,
    isLoading,
    fetchCoverages,
    createCoverage,
    cancelCoverage,
    getActiveCoveragesForDate,
    getSubstituteForSector,
    getCoveredSectorsForWorker,
    isWorkerAbsent,
  };
};
