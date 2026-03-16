import { useState, useEffect, useRef, useCallback } from 'react';

interface GeoPosition {
  lat: number;
  lng: number;
}

const JITTER_THRESHOLD_KM = 0.02; // 20 meters

const haversineDistance = (a: GeoPosition, b: GeoPosition): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

/**
 * Hook to get the worker's current GPS position in real-time.
 * Uses a jitter filter (20m threshold) to avoid phantom jumps when stationary.
 * Updates every `intervalMs` milliseconds (default 10s).
 */
export const useWorkerGeoPosition = (enabled = true, intervalMs = 10000) => {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableRef = useRef<GeoPosition | null>(null);

  const applyPosition = useCallback((newPos: GeoPosition) => {
    if (stableRef.current) {
      const dist = haversineDistance(stableRef.current, newPos);
      if (dist < JITTER_THRESHOLD_KM) return; // below 20m → ignore
    }
    stableRef.current = newPos;
    setPosition(newPos);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setLoading(false);
      return;
    }

    const fetchPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => applyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => applyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
  }, [enabled, intervalMs, applyPosition]);

  return { position, loading };
};
