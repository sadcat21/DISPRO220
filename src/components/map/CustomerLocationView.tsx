import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Navigation, ExternalLink } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CustomerLocationViewProps {
  latitude: number;
  longitude: number;
  customerName?: string;
  address?: string;
}

const CustomerLocationView: React.FC<CustomerLocationViewProps> = ({
  latitude,
  longitude,
  customerName,
  address,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom: 15,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Add marker with popup
    const marker = L.marker([latitude, longitude]).addTo(map);
    
    if (customerName || address) {
      let popupContent = '<div class="text-center">';
      if (customerName) popupContent += `<p class="font-bold">${customerName}</p>`;
      if (address) popupContent += `<p class="text-sm">${address}</p>`;
      popupContent += '</div>';
      marker.bindPopup(popupContent);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, customerName, address]);

  const openInGoogleMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(url, '_blank');
  };

  const openInWaze = () => {
    const url = `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-3">
      {/* Map Container */}
      <div className="h-48 rounded-lg overflow-hidden border">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      {/* Navigation Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openInGoogleMaps}
          className="flex items-center gap-2"
        >
          <Navigation className="w-4 h-4" />
          Google Maps
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openInWaze}
          className="flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Waze
        </Button>
      </div>

      {/* Coordinates */}
      <div className="text-xs text-muted-foreground text-center bg-muted/50 py-1.5 px-3 rounded">
        <span dir="ltr">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
      </div>
    </div>
  );
};

export default CustomerLocationView;
