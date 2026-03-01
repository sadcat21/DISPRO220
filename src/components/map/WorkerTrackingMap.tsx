import React, { useEffect, useRef } from 'react';
import { useWorkerLocations, WorkerLocationData } from '@/hooks/useWorkerLocation';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, MapPin, Users, Warehouse, Clock, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { calculateDistance } from '@/utils/geoUtils';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Warehouse location
const WAREHOUSE_LOCATION = { lat: 35.90775, lng: 0.10253 };

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface WorkerTrackingMapProps {
  highlightWorkerId?: string;
}

const WorkerTrackingMap: React.FC<WorkerTrackingMapProps> = ({ highlightWorkerId }) => {
  const { t, dir } = useLanguage();
  const { data: locations, isLoading } = useWorkerLocations();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Initialize map with ResizeObserver to ensure tiles load
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const container = mapContainerRef.current;
    
    // Ensure container has dimensions before initializing
    if (container.clientHeight === 0) {
      const retry = setTimeout(() => {
        mapRef.current = null; // allow re-init
      }, 100);
      return () => clearTimeout(retry);
    }

    const map = L.map(container, {
      center: [36.7, 3.08],
      zoom: 7,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM',
    }).addTo(map);

    mapRef.current = map;

    // Force multiple invalidateSize calls to ensure tiles render
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    // Aggressive tile refresh
    const timers = [100, 300, 500, 1000, 2000].map(ms =>
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, ms)
    );

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Update markers when locations change
  useEffect(() => {
    if (!mapRef.current || !locations) return;

    const currentIds = new Set(locations.map(l => l.worker_id));

    // Remove markers for workers no longer tracking
    markersRef.current.forEach((marker, workerId) => {
      if (!currentIds.has(workerId)) {
        mapRef.current!.removeLayer(marker);
        markersRef.current.delete(workerId);
      }
    });

    // Add warehouse marker
    if (!markersRef.current.has('__warehouse__')) {
      const warehouseIcon = L.divIcon({
        html: `<div style="background:#dc2626;width:32px;height:32px;border-radius:6px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1"><path d="M3 21V8l9-5 9 5v13H3z"/><path d="M9 21V13h6v8" fill="rgba(220,38,38,0.5)"/></svg>
        </div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      const whMarker = L.marker([WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng], { icon: warehouseIcon })
        .addTo(mapRef.current!)
        .bindPopup(`<div class="text-center p-1" dir="${dir}"><p class="font-bold text-sm">🏭 المخزن</p></div>`);
      markersRef.current.set('__warehouse__', whMarker);
    }

    // Update or add worker markers
    locations.forEach((loc) => {
      const distKm = calculateDistance(WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng, loc.latitude, loc.longitude);
      const distText = distKm < 1 ? `${Math.round(distKm * 1000)} م` : `${distKm.toFixed(1)} كم`;

      const isHighlighted = highlightWorkerId === loc.worker_id;
      const markerColor = isHighlighted ? '#dc2626' : (loc.is_tracking ? '#3b82f6' : '#9ca3af');
      const markerSize = isHighlighted ? 36 : 28;

      const icon = L.divIcon({
        html: `<div style="position:relative;">
          <div style="background:${markerColor};width:${markerSize}px;height:${markerSize}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;${isHighlighted ? 'animation:pulse 1.5s infinite;' : ''}">
            <svg width="${isHighlighted ? 18 : 14}" height="${isHighlighted ? 18 : 14}" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
          </div>
          <div style="position:absolute;top:${markerSize + 4}px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${isHighlighted ? 'rgba(220,38,38,0.9)' : 'rgba(0,0,0,0.75)'};color:white;padding:2px 6px;border-radius:4px;font-size:${isHighlighted ? '11px' : '10px'};font-weight:bold;">
            ${loc.worker_name || ''}
          </div>
        </div>`,
        className: '',
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
      });

      const popupContent = `
        <div class="text-center p-1" dir="${dir}">
          <p class="font-bold text-sm">${loc.worker_name}</p>
          <p class="text-xs" style="color:#dc2626;">🏭 البُعد عن المخزن: ${distText}</p>
          <p class="text-xs text-gray-500">${t('navigation.last_update')}: ${format(new Date(loc.updated_at), 'HH:mm:ss')}</p>
          ${loc.speed ? `<p class="text-xs">${t('navigation.speed')}: ${Math.round(loc.speed * 3.6)} كم/س</p>` : ''}
        </div>
      `;

      if (markersRef.current.has(loc.worker_id)) {
        const marker = markersRef.current.get(loc.worker_id)!;
        marker.setLatLng([loc.latitude, loc.longitude]);
        marker.setIcon(icon);
        marker.setPopupContent(popupContent);
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon })
          .addTo(mapRef.current!)
          .bindPopup(popupContent);
        markersRef.current.set(loc.worker_id, marker);
      }
    });

    // Fit bounds including warehouse
    if (locations.length > 0) {
      const allPoints: [number, number][] = [
        [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        ...locations.map(l => [l.latitude, l.longitude] as [number, number]),
      ];
      const bounds = L.latLngBounds(allPoints);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [locations, t, dir, highlightWorkerId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between" dir={dir}>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-bold">{t('navigation.worker_tracking')}</h3>
        </div>
        <Badge variant="secondary" className="gap-1">
          <MapPin className="w-3 h-3" />
          {locations?.length || 0} {t('navigation.active_workers')}
        </Badge>
      </div>

      {/* Map */}
      <div className="h-[400px] rounded-lg overflow-hidden border shadow-sm relative">
        <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />
      </div>

      {/* Worker List */}
      {locations && locations.length > 0 && (
        <div className="space-y-2" dir={dir}>
          {locations.map((loc) => {
            const distKm = calculateDistance(WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng, loc.latitude, loc.longitude);
            const distText = distKm < 1 ? `${Math.round(distKm * 1000)} م` : `${distKm.toFixed(1)} كم`;
            
            // Speed in km/h — use actual or default 40 km/h for stopped workers
            const speedKmh = (loc.speed && loc.speed > 0) ? loc.speed * 3.6 : 0;
            
            // Idle detection: use idle_since from DB (worker stayed in 20m radius for 5+ min)
            const idleSince = (loc as any).idle_since ? new Date((loc as any).idle_since) : null;
            const isStopped = !!idleSince;
            const etaSpeedKmh = isStopped ? 40 : (speedKmh || 40);
            const etaMinutes = Math.round((distKm / etaSpeedKmh) * 60);
            const etaText = etaMinutes < 60 ? `${etaMinutes} د` : `${Math.floor(etaMinutes / 60)} س ${etaMinutes % 60} د`;
            
            // Idle duration: time since idle_since
            const now = new Date();
            const idleMs = idleSince ? now.getTime() - idleSince.getTime() : 0;
            const idleMinutes = Math.floor(idleMs / 60000);
            const idleText = idleMinutes < 60 
              ? `${idleMinutes} د` 
              : `${Math.floor(idleMinutes / 60)} س ${idleMinutes % 60} د`;

            const isHighlighted = highlightWorkerId === loc.worker_id;

            return (
              <div key={loc.worker_id} className={`flex flex-col gap-1 p-2.5 rounded-lg text-sm ${isHighlighted ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted/50'}`}>
                {/* Row 1: Name + Distance */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${!loc.is_tracking ? 'bg-gray-400' : isStopped ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
                    <span className="font-medium">{loc.worker_name}</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <Warehouse className="w-3 h-3" />
                    {distText}
                  </span>
                </div>
                {/* Row 2: Details */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Navigation className="w-3 h-3" />
                      {isStopped ? 'متوقف' : `${Math.round(speedKmh)} كم/س`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      وصول ≈ {etaText}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isStopped && idleMinutes > 0 && (
                      <span className="text-amber-600 font-medium">⏸ متوقف {idleText}</span>
                    )}
                    <span>{format(new Date(loc.updated_at), 'HH:mm')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(!locations || locations.length === 0) && (
        <div className="text-center py-6 text-muted-foreground">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('navigation.no_active_workers')}</p>
        </div>
      )}
    </div>
  );
};

export default WorkerTrackingMap;
