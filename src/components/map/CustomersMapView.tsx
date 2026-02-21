import React, { useEffect, useRef, useState } from 'react';
import { Customer } from '@/types/database';
import { Loader2, MapPin, Users, Store, Warehouse, Building2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { WILAYA_COORDINATES, ALGERIA_CENTER } from '@/data/wilayaCoordinates';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
// Location type colors
const LOCATION_COLORS = {
  store: '#3b82f6',     // أزرق للمحلات
  warehouse: '#f97316', // برتقالي للمخازن
  office: '#22c55e',    // أخضر للمكاتب
  default: '#6b7280',   // رمادي افتراضي
};

// Custom marker icon with color based on location type
const createCustomIcon = (locationType?: string | null) => {
  const color = LOCATION_COLORS[locationType as keyof typeof LOCATION_COLORS] || LOCATION_COLORS.default;
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

const getLocationTypeLabel = (type?: string | null) => {
  switch (type) {
    case 'store': return 'محل';
    case 'warehouse': return 'مخزن';
    case 'office': return 'مكتب';
    default: return 'غير محدد';
  }
};

interface CustomerWithLocationType extends Customer {
  location_type?: string | null;
}

interface CustomersMapViewProps {
  customers: CustomerWithLocationType[];
  onCustomerClick?: (customer: CustomerWithLocationType) => void;
  branchWilaya?: string | null;
}

type LocationFilterType = 'all' | 'store' | 'warehouse' | 'office';

const CustomersMapView: React.FC<CustomersMapViewProps> = ({
  customers,
  onCustomerClick,
  branchWilaya,
}) => {
  const { t } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState<LocationFilterType>('all');

  // Filter customers with valid coordinates
  const customersWithLocation = customers.filter(
    (c) => c.latitude && c.longitude
  );

  // Apply location type filter
  const filteredCustomers = locationFilter === 'all'
    ? customersWithLocation
    : customersWithLocation.filter(c => c.location_type === locationFilter);

  // Count by type
  const countByType = {
    store: customersWithLocation.filter(c => c.location_type === 'store').length,
    warehouse: customersWithLocation.filter(c => c.location_type === 'warehouse').length,
    office: customersWithLocation.filter(c => c.location_type === 'office').length,
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up existing map
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Default center based on branch wilaya or Algeria
    const wilayaCoords = branchWilaya ? WILAYA_COORDINATES[branchWilaya] : null;
    let center: L.LatLngExpression = wilayaCoords 
      ? [wilayaCoords.lat, wilayaCoords.lng] 
      : [ALGERIA_CENTER.lat, ALGERIA_CENTER.lng];
    let zoom = wilayaCoords ? wilayaCoords.zoom : ALGERIA_CENTER.zoom;

    // If we have customers with locations, center on them
    if (filteredCustomers.length > 0) {
      const bounds = L.latLngBounds(
        filteredCustomers.map((c) => [c.latitude!, c.longitude!])
      );
      center = bounds.getCenter();
      zoom = 10;
    }

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    // Add markers for each customer
    markersRef.current = [];
    filteredCustomers.forEach((customer) => {
      const marker = L.marker([customer.latitude!, customer.longitude!], {
        icon: createCustomIcon(customer.location_type),
      }).addTo(map);

      // Create popup content with location type
      const typeLabel = getLocationTypeLabel(customer.location_type);
      const popupContent = `
        <div style="text-align: right; direction: rtl; min-width: 150px;">
          <strong style="font-size: 14px;">${customer.name}</strong>
          <br/><span style="color: #666; font-size: 11px;">📦 ${typeLabel}</span>
          ${customer.phone ? `<br/><span style="color: #666;">📞 ${customer.phone}</span>` : ''}
          ${customer.wilaya ? `<br/><span style="color: #666;">📍 ${customer.wilaya}</span>` : ''}
          ${customer.address ? `<br/><span style="color: #888; font-size: 12px;">${customer.address}</span>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        if (onCustomerClick) {
          onCustomerClick(customer);
        }
      });

      markersRef.current.push(marker);
    });

    // Fit bounds if we have multiple customers
    if (filteredCustomers.length > 1) {
      const bounds = L.latLngBounds(
        filteredCustomers.map((c) => [c.latitude!, c.longitude!])
      );
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    setIsLoading(false);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [filteredCustomers.length, locationFilter, branchWilaya]);

  if (customers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 text-primary" />
          <span>خريطة المواقع</span>
        </div>
        <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
          <Users className="w-3 h-3" />
          <span>{filteredCustomers.length} موقع</span>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-1 flex-wrap">
        <Button
          type="button"
          variant={locationFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setLocationFilter('all')}
        >
          الكل ({customersWithLocation.length})
        </Button>
        <Button
          type="button"
          variant={locationFilter === 'store' ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setLocationFilter('store')}
          style={{ borderColor: locationFilter !== 'store' ? LOCATION_COLORS.store : undefined }}
        >
          <Store className="w-3 h-3 ml-1" style={{ color: locationFilter !== 'store' ? LOCATION_COLORS.store : undefined }} />
          محل ({countByType.store})
        </Button>
        <Button
          type="button"
          variant={locationFilter === 'warehouse' ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setLocationFilter('warehouse')}
          style={{ borderColor: locationFilter !== 'warehouse' ? LOCATION_COLORS.warehouse : undefined }}
        >
          <Warehouse className="w-3 h-3 ml-1" style={{ color: locationFilter !== 'warehouse' ? LOCATION_COLORS.warehouse : undefined }} />
          مخزن ({countByType.warehouse})
        </Button>
        <Button
          type="button"
          variant={locationFilter === 'office' ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setLocationFilter('office')}
          style={{ borderColor: locationFilter !== 'office' ? LOCATION_COLORS.office : undefined }}
        >
          <Building2 className="w-3 h-3 ml-1" style={{ color: locationFilter !== 'office' ? LOCATION_COLORS.office : undefined }} />
          مكتب ({countByType.office})
        </Button>
      </div>

      {/* Map Container */}
      <div className="relative h-48 rounded-lg overflow-hidden border shadow-sm">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        <div ref={mapContainerRef} className="h-full w-full" />

        {/* No locations message */}
        {filteredCustomers.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="text-center text-muted-foreground text-sm">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>لا توجد مواقع محددة للعملاء</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LOCATION_COLORS.store }} />
          <span>محل</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LOCATION_COLORS.warehouse }} />
          <span>مخزن</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LOCATION_COLORS.office }} />
          <span>مكتب</span>
        </div>
      </div>
    </div>
  );
};

export default CustomersMapView;
