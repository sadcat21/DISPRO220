import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SectorSchedule {
  id: string;
  sector_id: string;
  schedule_type: 'sales' | 'delivery';
  day: string;
  worker_id: string | null;
  created_at: string;
}

export const useSectorSchedules = (sectorId?: string) => {
  const { activeBranch } = useAuth();
  const [schedules, setSchedules] = useState<SectorSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('sector_schedules').select('*').order('day');
      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setSchedules((data || []) as SectorSchedule[]);
    } catch (error) {
      console.error('Error fetching sector schedules:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sectorId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('sector-schedules-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sector_schedules' }, () => {
        fetchSchedules();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSchedules]);

  const upsertSchedule = async (schedule: Omit<SectorSchedule, 'id' | 'created_at'>) => {
    // Use upsert with the unique constraint (sector_id, schedule_type, day)
    const { error } = await supabase.from('sector_schedules').upsert(
      {
        sector_id: schedule.sector_id,
        schedule_type: schedule.schedule_type,
        day: schedule.day,
        worker_id: schedule.worker_id,
      },
      { onConflict: 'sector_id,schedule_type,day' }
    );
    if (error) throw error;
    await fetchSchedules();
  };

  const deleteSchedule = async (sectorId: string, scheduleType: string, day: string) => {
    const { error } = await supabase
      .from('sector_schedules')
      .delete()
      .eq('sector_id', sectorId)
      .eq('schedule_type', scheduleType)
      .eq('day', day);
    if (error) throw error;
    await fetchSchedules();
  };

  const deleteAllForSector = async (sectorId: string) => {
    const { error } = await supabase
      .from('sector_schedules')
      .delete()
      .eq('sector_id', sectorId);
    if (error) throw error;
    await fetchSchedules();
  };

  const saveSectorSchedules = async (
    sectorId: string,
    newSchedules: { schedule_type: 'sales' | 'delivery'; day: string; worker_id: string | null }[]
  ) => {
    // Delete all existing schedules for this sector
    await supabase.from('sector_schedules').delete().eq('sector_id', sectorId);

    // Insert new ones
    if (newSchedules.length > 0) {
      const { error } = await supabase.from('sector_schedules').insert(
        newSchedules.map(s => ({
          sector_id: sectorId,
          schedule_type: s.schedule_type,
          day: s.day,
          worker_id: s.worker_id,
        }))
      );
      if (error) throw error;
    }
    await fetchSchedules();
  };

  // Helper: get schedules grouped by sector
  const getSchedulesBySector = useCallback((targetSectorId: string) => {
    return schedules.filter(s => s.sector_id === targetSectorId);
  }, [schedules]);

  // Helper: get sectors for a worker on a specific day and type
  const getSectorIdsForWorkerDay = useCallback((workerId: string, day: string, type: 'sales' | 'delivery') => {
    return schedules
      .filter(s => s.worker_id === workerId && s.day === day && s.schedule_type === type)
      .map(s => s.sector_id);
  }, [schedules]);

  return {
    schedules,
    isLoading,
    fetchSchedules,
    upsertSchedule,
    deleteSchedule,
    deleteAllForSector,
    saveSectorSchedules,
    getSchedulesBySector,
    getSectorIdsForWorkerDay,
  };
};
