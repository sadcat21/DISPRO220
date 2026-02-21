import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navigation, X, Loader2, MapPin, Clock, Route } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface NavigationMapViewProps {
  destinationLat: number;
  destinationLng: number;
  customerName: string;
  address?: string;
  onClose: () => void;
}

interface RouteInfo {
  distance: number; // in meters
  duration: number; // in seconds
  instructions: { text: string; distance: number }[];
}

const NavigationMapView: React.FC<NavigationMapViewProps> = ({
  destinationLat,
  destinationLng,
  customerName,
  address,
  onClose,
}) => {
  const { t, dir } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const workerMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workerPos, setWorkerPos] = useState<[number, number] | null>(null);

  // Create worker icon
  const workerIcon = L.divIcon({
    html: `<div style="background:#3b82f6;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);position:relative;">
      <div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:8px solid #3b82f6;"></div>
    </div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const customerIcon = L.divIcon({
    html: `<div style="background:#ef4444;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
    </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  // Fetch route from OSRM
  const fetchRoute = async (fromLat: number, fromLng: number) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${destinationLng},${destinationLat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes?.length) {
        setError(t('navigation.route_not_found'));
        return;
      }

      const route = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );

      // Draw route on map
      if (routeLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(routeLayerRef.current);
      }

      if (mapRef.current) {
        routeLayerRef.current = L.polyline(coords, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.8,
        }).addTo(mapRef.current);

        mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [40, 40] });
      }

      // Extract instructions
      const steps = route.legs[0]?.steps || [];
      const instructions = steps.map((s: any) => ({
        text: s.maneuver?.instruction || s.name || '',
        distance: s.distance,
      }));

      setRouteInfo({
        distance: route.distance,
        duration: route.duration,
        instructions,
      });
    } catch (err) {
      setError(t('navigation.route_error'));
    }
  };

  // Initialize map and start tracking
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [destinationLat, destinationLng],
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM',
    }).addTo(map);

    // Add customer marker
    L.marker([destinationLat, destinationLng], { icon: customerIcon })
      .addTo(map)
      .bindPopup(`<div class="text-center"><b>${customerName}</b>${address ? `<br/><small>${address}</small>` : ''}</div>`);

    mapRef.current = map;

    // Start geolocation
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setWorkerPos([lat, lng]);

          if (workerMarkerRef.current && mapRef.current) {
            workerMarkerRef.current.setLatLng([lat, lng]);
          } else if (mapRef.current) {
            workerMarkerRef.current = L.marker([lat, lng], { icon: workerIcon }).addTo(mapRef.current);
          }

          fetchRoute(lat, lng);
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    } else {
      setError('GPS not supported');
      setLoading(false);
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      map.remove();
      mapRef.current = null;
      workerMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  const formatDistance = (m: number) => {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} كم`;
    return `${Math.round(m)} م`;
  };

  const formatDuration = (s: number) => {
    const mins = Math.round(s / 60);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h} س ${m} د`;
    }
    return `${mins} د`;
  };

  const openInGoogleMaps = () => {
    const origin = workerPos ? `${workerPos[0]},${workerPos[1]}` : '';
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destinationLat},${destinationLng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${destinationLat},${destinationLng}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-background z-[9999] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-card shadow-sm" dir={dir}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MapPin className="w-5 h-5 text-destructive shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{customerName}</p>
            {address && <p className="text-xs text-muted-foreground truncate">{address}</p>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 text-destructive">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Route Info Bar */}
      {routeInfo && (
        <div className="flex items-center justify-between px-4 py-2 bg-primary text-primary-foreground" dir={dir}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Route className="w-4 h-4" />
              <span className="font-bold text-sm">{formatDistance(routeInfo.distance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span className="font-bold text-sm">{formatDuration(routeInfo.duration)}</span>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs gap-1"
            onClick={openInGoogleMaps}
          >
            <Navigation className="w-3 h-3" />
            Google Maps
          </Button>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="h-full w-full" />

        {loading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">{t('navigation.getting_location')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute bottom-4 inset-x-4">
            <div className="bg-destructive/90 text-destructive-foreground p-3 rounded-lg text-sm text-center">
              {error}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 end-3 bg-card/90 backdrop-blur-sm p-2 rounded-lg shadow text-xs space-y-1" dir={dir}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 border border-white" />
            <span>{t('navigation.your_location')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive border border-white" />
            <span>{t('navigation.destination')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationMapView;
