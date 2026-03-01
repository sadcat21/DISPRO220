import React, { useEffect, useRef } from 'react';
import { useWorkerLocations, WorkerLocationData } from '@/hooks/useWorkerLocation';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const WorkerTrackingMap: React.FC = () => {
  const { t, dir } = useLanguage();
  const { data: locations, isLoading } = useWorkerLocations();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Initialize map with ResizeObserver to ensure tiles load
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const container = mapContainerRef.current;
    const map = L.map(container, {
      center: [36.7, 3.08],
      zoom: 7,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM',
    }).addTo(map);

    mapRef.current = map;

    // Use ResizeObserver + multiple invalidateSize to guarantee tile rendering
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    const t1 = setTimeout(() => map.invalidateSize(), 200);
    const t2 = setTimeout(() => map.invalidateSize(), 600);
    const t3 = setTimeout(() => map.invalidateSize(), 1200);

    return () => {
      observer.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
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

    // Update or add markers
    locations.forEach((loc) => {
      const icon = L.divIcon({
        html: `<div style="position:relative;">
          <div style="background:#3b82f6;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
          </div>
          <div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,0.75);color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;">
            ${loc.worker_name || ''}
          </div>
        </div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const popupContent = `
        <div class="text-center p-1" dir="${dir}">
          <p class="font-bold text-sm">${loc.worker_name}</p>
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

    // Fit bounds if there are locations
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(l => [l.latitude, l.longitude] as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [locations, t, dir]);

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
      <div className="h-[400px] rounded-lg overflow-hidden border shadow-sm">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      {/* Worker List */}
      {locations && locations.length > 0 && (
        <div className="space-y-2" dir={dir}>
          {locations.map((loc) => (
            <div key={loc.worker_id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="font-medium">{loc.worker_name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {loc.speed && loc.speed > 0 && (
                  <span>{Math.round(loc.speed * 3.6)} كم/س</span>
                )}
                <span>{format(new Date(loc.updated_at), 'HH:mm')}</span>
              </div>
            </div>
          ))}
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
