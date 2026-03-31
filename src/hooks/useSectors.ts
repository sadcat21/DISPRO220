import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sector } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const useSectors = () => {
  const { activeBranch } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSectors = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('sectors').select('*').order('name');
      if (activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      setSectors((data || []) as Sector[]);
    } catch (error) {
      console.error('Error fetching sectors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeBranch]);

  useEffect(() => {
    fetchSectors();
  }, [fetchSectors]);

  // Realtime subscription for sectors
  useEffect(() => {
    const baseChannelName = 'sectors-realtime';
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sectors' }, () => {
        fetchSectors();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sector_zones' }, () => {
        fetchSectors();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSectors]);

  const createSector = async (sector: Omit<Sector, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase.from('sectors').insert(sector).select().single();
    if (error) throw error;
    await fetchSectors();
    return data;
  };

  const updateSector = async (id: string, updates: Partial<Sector>) => {
    const { error } = await supabase.from('sectors').update(updates).eq('id', id);
    if (error) throw error;
    await fetchSectors();
  };

  const deleteSector = async (id: string) => {
    await supabase.from('customers').update({ sector_id: null }).eq('sector_id', id);
    const { error } = await supabase.from('sectors').delete().eq('id', id);
    if (error) throw error;
    await fetchSectors();
  };

  return { sectors, isLoading, fetchSectors, createSector, updateSector, deleteSector };
};
