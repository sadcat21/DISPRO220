import { useState, useCallback } from 'react';
import { useLocationThreshold } from '@/hooks/useLocationSettings';
import { useHasPermission } from '@/hooks/usePermissions';
import { calculateDistance } from '@/utils/geoUtils';
import { toast } from 'sonner';

interface UseLocationCheckOptions {
  customerLatitude?: number | null;
  customerLongitude?: number | null;
}

/**
 * Hook to verify the worker is within range of a customer's location.
 * Workers with bypass_location_check permission skip the check.
 * Returns { checkLocation, isChecking } where checkLocation returns a promise resolving to true if allowed.
 */
export const useLocationCheck = ({ customerLatitude, customerLongitude }: UseLocationCheckOptions) => {
  const { data: threshold } = useLocationThreshold();
  const canBypass = useHasPermission('bypass_location_check');
  const [isChecking, setIsChecking] = useState(false);

  const checkLocation = useCallback(async (): Promise<boolean> => {
    // If can bypass or no customer location, allow
    if (canBypass) return true;
    if (!customerLatitude || !customerLongitude) return true;

    const thresholdMeters = threshold ?? 100;

    setIsChecking(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('no_geolocation'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, () => {
          // Fallback low accuracy
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, timeout: 10000, maximumAge: 120000,
          });
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
      });

      const distanceKm = calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        customerLatitude,
        customerLongitude
      );
      const distanceMeters = distanceKm * 1000;

      if (distanceMeters > thresholdMeters) {
        toast.error(`أنت بعيد عن موقع العميل (${Math.round(distanceMeters)} متر). يجب أن تكون على بُعد ${thresholdMeters} متر أو أقل.`);
        return false;
      }
      return true;
    } catch {
      toast.error('تعذر تحديد موقعك الحالي. يرجى تفعيل خدمة الموقع.');
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [canBypass, customerLatitude, customerLongitude, threshold]);

  return { checkLocation, isChecking };
};
