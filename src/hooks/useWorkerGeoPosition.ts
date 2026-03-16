import { useState, useEffect, useRef } from 'react';

interface GeoPosition {
  lat: number;
  lng: number;
}

/**
 * Hook to get the worker's current GPS position in real-time.
 * Updates every `intervalMs` milliseconds (default 10s).
 */
export const useWorkerGeoPosition = (enabled = true, intervalMs = 10000) => {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setLoading(false);
      return;
    }

    const fetchPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLoading(false);
        },
        () => {
          // Fallback with lower accuracy
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setLoading(false);
            },
            () => setLoading(false),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 }
      );
    };

    fetchPosition();
    intervalRef.current = setInterval(fetchPosition, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, intervalMs]);

  return { position, loading };
};
