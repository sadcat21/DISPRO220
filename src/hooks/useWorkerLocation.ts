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
  // Idle detection: track anchor point and time
  const anchorRef = useRef<{ lat: number; lng: number; since: number } | null>(null);
  const IDLE_RADIUS_KM = 0.02; // 20 meters
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const updateLocation = useCallback(async (position: GeolocationPosition) => {
    if (!workerId) return;
    
    const now = Date.now();
    if (now - lastUpdateRef.current < 10000) return;
    lastUpdateRef.current = now;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    // Idle detection logic
    let idleSince: string | null = null;
    if (anchorRef.current) {
      const dist = haversine(anchorRef.current.lat, anchorRef.current.lng, lat, lng);
      if (dist <= IDLE_RADIUS_KM) {
        // Still within anchor radius
        const elapsedMs = now - anchorRef.current.since;
        if (elapsedMs >= IDLE_THRESHOLD_MS) {
          idleSince = new Date(anchorRef.current.since).toISOString();
        }
      } else {
        // Moved outside radius — reset anchor
        anchorRef.current = { lat, lng, since: now };
      }
    } else {
      anchorRef.current = { lat, lng, since: now };
    }

    try {
      const { error } = await supabase
        .from('worker_locations')
        .upsert({
          worker_id: workerId,
          branch_id: activeBranch?.id || null,
          latitude: lat,
          longitude: lng,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          is_tracking: true,
          idle_since: idleSince,
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
    anchorRef.current = null;

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
    anchorRef.current = null;

    if (workerId) {
      await supabase
        .from('worker_locations')
        .update({ is_tracking: false, idle_since: null, updated_at: new Date().toISOString() })
        .eq('worker_id', workerId);
    }
  }, [workerId]);

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
      // Fetch ALL worker locations (no branch filter) to show every worker
      const { data: locations, error } = await supabase
        .from('worker_locations')
        .select('*');
      if (error) throw error;

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
