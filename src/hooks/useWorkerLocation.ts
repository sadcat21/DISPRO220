import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WorkerLocationData {
  worker_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  is_tracking: boolean;
  updated_at: string;
  worker_name?: string;
}

// Hook for workers to broadcast their location
export const useLocationBroadcast = () => {
  const { workerId, activeBranch } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const updateLocation = useCallback(async (position: GeolocationPosition) => {
    if (!workerId) return;
    
    // Throttle updates to every 10 seconds
    const now = Date.now();
    if (now - lastUpdateRef.current < 10000) return;
    lastUpdateRef.current = now;

    try {
      const { error } = await supabase
        .from('worker_locations')
        .upsert({
          worker_id: workerId,
          branch_id: activeBranch?.id || null,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          is_tracking: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'worker_id' });

      if (error) console.error('Location update error:', error);
    } catch (err) {
      console.error('Location broadcast error:', err);
    }
  }, [workerId, activeBranch]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    setError(null);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (err) => {
        setError(err.message);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  }, [updateLocation]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);

    // Mark as not tracking in DB
    if (workerId) {
      await supabase
        .from('worker_locations')
        .update({ is_tracking: false, updated_at: new Date().toISOString() })
        .eq('worker_id', workerId);
    }
  }, [workerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { isTracking, error, startTracking, stopTracking };
};

// Hook for admins to view all worker locations (with realtime)
export const useWorkerLocations = () => {
  const { activeBranch, role } = useAuth();
  const queryClient = useQueryClient();
  const branchId = activeBranch?.id;
  const isAdmin = role === 'admin' || role === 'branch_admin';

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('worker-locations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_locations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['worker-locations'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, queryClient]);

  return useQuery({
    queryKey: ['worker-locations', branchId],
    queryFn: async () => {
      let query = supabase
        .from('worker_locations')
        .select('*')
        .eq('is_tracking', true);

      if (branchId) query = query.eq('branch_id', branchId);

      const { data: locations, error } = await query;
      if (error) throw error;

      // Fetch worker names
      const workerIds = (locations || []).map(l => l.worker_id);
      if (workerIds.length === 0) return [];

      const { data: workers } = await supabase
        .from('workers_safe')
        .select('id, full_name')
        .in('id', workerIds);

      const workerMap = new Map((workers || []).map(w => [w.id, w.full_name]));

      return (locations || []).map(l => ({
        ...l,
        worker_name: workerMap.get(l.worker_id) || '',
      })) as WorkerLocationData[];
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });
};
