import React, { useState, useEffect } from 'react';
import { MapPin, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { calculateDistance, formatDistance } from '@/utils/geoUtils';
import { useLanguage } from '@/contexts/LanguageContext';

interface CustomerDistanceIndicatorProps {
  customerLatitude?: number | null;
  customerLongitude?: number | null;
  thresholdMeters?: number;
}

const CustomerDistanceIndicator: React.FC<CustomerDistanceIndicatorProps> = ({
  customerLatitude,
  customerLongitude,
  thresholdMeters = 100,
}) => {
  const { dir } = useLanguage();
  const isRtl = dir === 'rtl';
  const [workerPosition, setWorkerPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!customerLatitude || !customerLongitude) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    if (!navigator.geolocation) {
      setLoading(false);
      setError(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWorkerPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      () => {
        // Fallback with lower accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setWorkerPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setLoading(false);
          },
          () => {
            setError(true);
            setLoading(false);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  }, [customerLatitude, customerLongitude]);

  if (!customerLatitude || !customerLongitude) return null;

  if (loading) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground py-1 ${isRtl ? 'flex-row-reverse justify-end' : ''}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>جارٍ تحديد المسافة...</span>
      </div>
    );
  }

  if (error || !workerPosition) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground py-1 ${isRtl ? 'flex-row-reverse justify-end' : ''}`}>
        <MapPin className="w-3.5 h-3.5" />
        <span>تعذر تحديد موقعك الحالي</span>
      </div>
    );
  }

  const distanceKm = calculateDistance(
    workerPosition.lat,
    workerPosition.lng,
    customerLatitude,
    customerLongitude
  );
  const distanceMeters = distanceKm * 1000;
  const isFar = distanceMeters > thresholdMeters;

  return (
    <div dir={dir} className={`flex items-center gap-1.5 text-xs py-1 px-2 rounded-md w-full ${
      isRtl ? 'flex-row-reverse justify-end text-right' : ''
    } ${
      isFar 
        ? 'bg-destructive/10 text-destructive' 
        : 'bg-green-500/10 text-green-700 dark:text-green-400'
    }`}>
      {isFar ? (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="font-medium">
        {formatDistance(distanceKm)}
        {isFar && ' — لست في موقع العميل'}
      </span>
    </div>
  );
};

export default CustomerDistanceIndicator;
