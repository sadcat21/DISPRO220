import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { calculateDistance } from '@/utils/geoUtils';
import { toast } from 'sonner';

export const useAttendance = () => {
  const { workerId, activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const [isChecking, setIsChecking] = useState(false);

  // Get today's attendance for current worker
  const { data: todayLogs = [], isLoading } = useQuery({
    queryKey: ['attendance-today', workerId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('worker_id', workerId!)
        .gte('recorded_at', `${today}T00:00:00`)
        .lte('recorded_at', `${today}T23:59:59`)
        .order('recorded_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!workerId,
    refetchInterval: 30000,
  });

  const lastAction = todayLogs.length > 0 ? todayLogs[todayLogs.length - 1] : null;
  const isClockedIn = lastAction?.action_type === 'clock_in';

  // Get branch/warehouse location
  const { data: branchLocation } = useQuery({
    queryKey: ['branch-location', activeBranch?.id],
    queryFn: async () => {
      // Get warehouse location from app_settings
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['warehouse_latitude', 'warehouse_longitude'])
        .eq('branch_id', activeBranch?.id || '');
      
      if (data && data.length >= 2) {
        const lat = data.find(d => d.key === 'warehouse_latitude');
        const lng = data.find(d => d.key === 'warehouse_longitude');
        if (lat && lng) {
          return { latitude: parseFloat(lat.value), longitude: parseFloat(lng.value) };
        }
      }

      // Fallback: try global settings
      const { data: global } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['warehouse_latitude', 'warehouse_longitude'])
        .is('branch_id', null);
      
      if (global && global.length >= 2) {
        const lat = global.find(d => d.key === 'warehouse_latitude');
        const lng = global.find(d => d.key === 'warehouse_longitude');
        if (lat && lng) {
          return { latitude: parseFloat(lat.value), longitude: parseFloat(lng.value) };
        }
      }

      return null;
    },
    enabled: !!activeBranch?.id || true,
  });

  const recordMutation = useMutation({
    mutationFn: async ({ actionType, latitude, longitude, distance }: {
      actionType: 'clock_in' | 'clock_out';
      latitude: number;
      longitude: number;
      distance: number;
    }) => {
      const { error } = await supabase.from('attendance_logs').insert({
        worker_id: workerId!,
        branch_id: activeBranch?.id || null,
        action_type: actionType,
        latitude,
        longitude,
        distance_meters: distance,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-all'] });
      toast.success(vars.actionType === 'clock_in' ? 'تم تسجيل بداية العمل ✅' : 'تم تسجيل نهاية العمل ✅');
    },
    onError: () => {
      toast.error('فشل في تسجيل المداومة');
    },
  });

  const toggleAttendance = useCallback(async () => {
    if (!workerId) return;
    
    const actionType = isClockedIn ? 'clock_out' : 'clock_in';
    setIsChecking(true);

    try {
      // Get current position
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('لا يدعم المتصفح خدمة الموقع'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, () => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, timeout: 10000, maximumAge: 120000,
          });
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
      });

      const workerLat = position.coords.latitude;
      const workerLng = position.coords.longitude;

      // Check distance from warehouse
      if (branchLocation) {
        const distKm = calculateDistance(workerLat, workerLng, branchLocation.latitude, branchLocation.longitude);
        const distMeters = distKm * 1000;

        if (distMeters > 50) {
          toast.error(`أنت بعيد عن المخزن (${Math.round(distMeters)} متر). يجب أن تكون على بُعد 50 متر أو أقل.`);
          return;
        }

        await recordMutation.mutateAsync({ actionType, latitude: workerLat, longitude: workerLng, distance: distMeters });
      } else {
        // No warehouse location configured, allow but record
        await recordMutation.mutateAsync({ actionType, latitude: workerLat, longitude: workerLng, distance: 0 });
      }
    } catch {
      toast.error('تعذر تحديد موقعك. يرجى تفعيل خدمة الموقع.');
    } finally {
      setIsChecking(false);
    }
  }, [workerId, isClockedIn, branchLocation, recordMutation]);

  return {
    todayLogs,
    isClockedIn,
    lastAction,
    isChecking,
    isLoading,
    toggleAttendance,
  };
};

// Hook for admin to view all attendance
export const useAllAttendance = (date: string, branchId?: string) => {
  return useQuery({
    queryKey: ['attendance-all', date, branchId],
    queryFn: async () => {
      let q = supabase
        .from('attendance_logs')
        .select('*, worker:workers(id, full_name, role)')
        .gte('recorded_at', `${date}T00:00:00`)
        .lte('recorded_at', `${date}T23:59:59`)
        .order('recorded_at', { ascending: true });
      
      if (branchId) {
        q = q.eq('branch_id', branchId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
};
