import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useWorkerLocations, WorkerLocationData } from '@/hooks/useWorkerLocation';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, MapPin, Users, Warehouse, Clock, Navigation, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { calculateDistance } from '@/utils/geoUtils';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Warehouse location
const WAREHOUSE_LOCATION = { lat: 35.90775, lng: 0.10253 };

const TILE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OSM',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
  },
};

const LABELS_LAYER_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface WorkerTrackingMapProps {
  highlightWorkerId?: string;
  showOnlyHighlighted?: boolean;
  trackableWorkerIds?: string[];
}

const WorkerTrackingMap: React.FC<WorkerTrackingMapProps> = ({ highlightWorkerId, showOnlyHighlighted, trackableWorkerIds }) => {
  const { t, dir } = useLanguage();
  const { data: rawLocations, isLoading } = useWorkerLocations();
  const filteredByTrackable = trackableWorkerIds
    ? rawLocations?.filter(l => trackableWorkerIds.includes(l.worker_id))
    : rawLocations;
  const locations = showOnlyHighlighted && highlightWorkerId
    ? filteredByTrackable?.filter(l => l.worker_id === highlightWorkerId)
    : filteredByTrackable;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const hasFittedBoundsRef = useRef(false);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const userInteractedRef = useRef(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('satellite');
  const [showLabels, setShowLabels] = useState(true);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize map with robust sizing
  useEffect(() => {
    if (!mapContainerRef.current) return;
    // If map already exists, just invalidate
    if (mapRef.current) {
      mapRef.current.invalidateSize();
      return;
    }

    const container = mapContainerRef.current;

    // Ensure the container has actual dimensions before creating the map
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Retry after a frame
      const raf = requestAnimationFrame(() => {
        if (mapContainerRef.current && !mapRef.current) {
          const r2 = mapContainerRef.current.getBoundingClientRect();
          if (r2.width > 0 && r2.height > 0) {
            initMap(mapContainerRef.current);
          }
        }
      });
      return () => cancelAnimationFrame(raf);
    }

    initMap(container);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const observerRef = useRef<ResizeObserver | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const initMap = useCallback((container: HTMLDivElement) => {
    if (mapRef.current) return;

    const map = L.map(container, {
      center: [36.7, 3.08],
      zoom: 7,
      scrollWheelZoom: true,
    });

    const tile = L.tileLayer(TILE_LAYERS.satellite.url, {
      attribution: TILE_LAYERS.satellite.attribution,
    }).addTo(map);
    tileLayerRef.current = tile;

    // Add labels overlay by default
    const labels = L.tileLayer(LABELS_LAYER_URL, {
      attribution: '© CARTO',
      pane: 'overlayPane',
    }).addTo(map);
    labelsLayerRef.current = labels;

    mapRef.current = map;

    // Track user interaction to prevent auto-zoom override
    map.on('zoomstart', (e: any) => {
      // Only mark as user-interacted if not programmatic
      if (!e.flyTo) userInteractedRef.current = true;
    });
    map.on('dragstart', () => {
      userInteractedRef.current = true;
    });

    // ResizeObserver for dynamic resizing
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    observerRef.current = observer;

    // Aggressive tile refresh at staggered intervals
    const timers = [100, 250, 500, 1000, 2000, 4000].map(ms =>
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, ms)
    );
    timersRef.current = timers;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      timersRef.current.forEach(clearTimeout);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
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
      const hasLocation = loc.has_location !== false;
      const distKm = hasLocation
        ? calculateDistance(WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng, loc.latitude, loc.longitude)
        : null;
      const distText = hasLocation
        ? (distKm! < 1 ? `${Math.round(distKm! * 1000)} م` : `${distKm!.toFixed(1)} كم`)
        : 'غير متاح';

      const isHighlighted = highlightWorkerId === loc.worker_id;
      const markerColor = isHighlighted
        ? '#dc2626'
        : hasLocation
          ? (loc.is_tracking ? '#3b82f6' : '#9ca3af')
          : '#6b7280';
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
          ${hasLocation ? `<p class="text-xs" style="color:#dc2626;">🏭 البُعد عن المخزن: ${distText}</p>` : `<p class="text-xs text-gray-500">لا يوجد موقع محفوظ بعد</p>`}
          ${hasLocation ? `<p class="text-xs text-gray-500">${t('navigation.last_update')}: ${format(new Date(loc.updated_at), 'HH:mm:ss')}</p>` : ''}
          ${hasLocation && loc.speed ? `<p class="text-xs">${t('navigation.speed')}: ${Math.round(loc.speed * 3.6)} كم/س</p>` : ''}
        </div>
      `;

      const onMarkerClick = () => {
        if (mapRef.current) {
          mapRef.current.flyTo([loc.latitude, loc.longitude], 16, { duration: 0.8 });
        }
      };

      if (markersRef.current.has(loc.worker_id)) {
        const marker = markersRef.current.get(loc.worker_id)!;
        marker.setLatLng([loc.latitude, loc.longitude]);
        marker.setIcon(icon);
        marker.setPopupContent(popupContent);
        marker.off('click').on('click', onMarkerClick);
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon })
          .addTo(mapRef.current!)
          .bindPopup(popupContent)
          .on('click', onMarkerClick);
        markersRef.current.set(loc.worker_id, marker);
      }
    });

    // Fit bounds only on first data load and if user hasn't interacted
    if (locations.length > 0 && !hasFittedBoundsRef.current && !userInteractedRef.current) {
      hasFittedBoundsRef.current = true;
      const allPoints: [number, number][] = [
        [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        ...locations.map(l => [l.latitude, l.longitude] as [number, number]),
      ];
      const bounds = L.latLngBounds(allPoints);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [locations, t, dir, highlightWorkerId]);
  // Switch tile layer when mapStyle changes
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const config = TILE_LAYERS[mapStyle];
    tileLayerRef.current.setUrl(config.url);
  }, [mapStyle]);

  // Toggle labels overlay
  useEffect(() => {
    if (!mapRef.current) return;
    if (showLabels && !labelsLayerRef.current) {
      labelsLayerRef.current = L.tileLayer(LABELS_LAYER_URL, {
        attribution: '© CARTO',
        pane: 'overlayPane',
      }).addTo(mapRef.current);
    } else if (!showLabels && labelsLayerRef.current) {
      mapRef.current.removeLayer(labelsLayerRef.current);
      labelsLayerRef.current = null;
    }
  }, [showLabels]);

  // Fetch and draw route from highlighted worker to warehouse
  useEffect(() => {
    if (!mapRef.current || !highlightWorkerId || !showOnlyHighlighted || !locations) return;

    const loc = locations.find(l => l.worker_id === highlightWorkerId);
    if (!loc || loc.has_location === false) {
      // Clear existing route
      if (routeLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      setRouteInfo(null);
      return;
    }

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${loc.longitude},${loc.latitude};${WAREHOUSE_LOCATION.lng},${WAREHOUSE_LOCATION.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes?.length || !mapRef.current) return;

        const route = data.routes[0];
        const coords: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );

        // Remove old route
        if (routeLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(routeLayerRef.current);
        }

        // Draw new route
        routeLayerRef.current = L.polyline(coords, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.7,
          dashArray: '10, 8',
        }).addTo(mapRef.current);

        // Fit bounds to show full route only if user hasn't manually zoomed
        if (!userInteractedRef.current) {
          mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
        }

        setRouteInfo({
          distance: route.distance,
          duration: route.duration,
        });
      } catch (err) {
        console.error('Route fetch error:', err);
      }
    };

    fetchRoute();
  }, [locations, highlightWorkerId, showOnlyHighlighted]);

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

      {/* Route Info Bar */}
      {routeInfo && highlightWorkerId && showOnlyHighlighted && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-primary text-primary-foreground" dir={dir}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Route className="w-4 h-4" />
              <span className="font-bold text-sm">
                {routeInfo.distance >= 1000
                  ? `${(routeInfo.distance / 1000).toFixed(1)} كم`
                  : `${Math.round(routeInfo.distance)} م`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span className="font-bold text-sm">
                {(() => {
                  const mins = Math.round(routeInfo.duration / 60);
                  if (mins >= 60) {
                    return `${Math.floor(mins / 60)} س ${mins % 60} د`;
                  }
                  return `${mins} د`;
                })()}
              </span>
            </div>
          </div>
          <span className="text-xs opacity-80">🏭 → المخزن</span>
        </div>
      )}

      {/* Map */}
      <div className="h-[400px] rounded-lg overflow-hidden border shadow-sm relative">
        <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />
        {/* Map controls */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5" style={{ zIndex: 1000 }}>
          <button
            onClick={() => setMapStyle(prev => prev === 'street' ? 'satellite' : 'street')}
            className="bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-xs font-medium shadow-md hover:bg-accent transition-colors"
          >
            {mapStyle === 'street' ? '🛰️ قمر صناعي' : '🗺️ مخطط'}
          </button>
          <button
            onClick={() => setShowLabels(prev => !prev)}
            className={`bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-xs font-medium shadow-md hover:bg-accent transition-colors ${showLabels ? 'ring-1 ring-primary' : ''}`}
          >
            {showLabels ? '🏷️ معالم ✓' : '🏷️ معالم'}
          </button>
        </div>
      </div>

      {/* Worker List */}
      {locations && locations.length > 0 && (
        <div className="space-y-2" dir={dir}>
          {locations.map((loc) => {
            const hasLocation = loc.has_location !== false;
            const distKm = hasLocation
              ? calculateDistance(WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng, loc.latitude, loc.longitude)
              : null;
            const distText = hasLocation
              ? (distKm! < 1 ? `${Math.round(distKm! * 1000)} م` : `${distKm!.toFixed(1)} كم`)
              : 'غير متاح';

            const speedKmh = hasLocation && (loc.speed && loc.speed > 0) ? loc.speed * 3.6 : 0;

            const idleSince = hasLocation && (loc as any).idle_since ? new Date((loc as any).idle_since) : null;
            const isStopped = !!idleSince;
            const etaSpeedKmh = isStopped ? 40 : (speedKmh || 40);
            const etaMinutes = hasLocation ? Math.round((distKm! / etaSpeedKmh) * 60) : 0;
            const etaText = hasLocation
              ? (etaMinutes < 60 ? `${etaMinutes} د` : `${Math.floor(etaMinutes / 60)} س ${etaMinutes % 60} د`)
              : 'غير متاح';

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
                    <div className={`w-2.5 h-2.5 rounded-full ${!hasLocation ? 'bg-muted-foreground' : !loc.is_tracking ? 'bg-muted-foreground' : isStopped ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
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
                      {!hasLocation ? 'لا يوجد موقع' : isStopped ? 'متوقف' : `${Math.round(speedKmh)} كم/س`}
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
                    {hasLocation ? <span>{format(new Date(loc.updated_at), 'HH:mm')}</span> : <span>—</span>}
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
