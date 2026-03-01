import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, Loader2, Navigation } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import OpenLocationCode from 'open-location-code';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationPickerProps {
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
  initialSearchQuery?: string;
  onSearchFromAddress?: () => void;
  addressToSearch?: string;
  defaultWilaya?: string;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

const LocationPicker: React.FC<LocationPickerProps> = ({
  latitude,
  longitude,
  onLocationChange,
  initialSearchQuery,
  onSearchFromAddress,
  addressToSearch,
  defaultWilaya,
}) => {
  const { t } = useLanguage();
  // Default to Algeria center
  const defaultLat = 28.0339;
  const defaultLng = 1.6596;
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  
  const [position, setPosition] = useState<[number, number] | null>(
    latitude && longitude ? [latitude, longitude] : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const initialSearchDoneRef = useRef(false);
  const handleLocationSelectRef = useRef<(lat: number, lng: number) => void>();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: position || [defaultLat, defaultLng],
      zoom: position ? 15 : 5,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Add click handler - use ref to always get latest callback
    map.on('click', (e: L.LeafletMouseEvent) => {
      handleLocationSelectRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    setMapReady(true);

    // Add initial marker if position exists
    if (position) {
      const marker = L.marker(position).addTo(map);
      markerRef.current = marker;
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Auto-search when initialSearchQuery or defaultWilaya is provided
  useEffect(() => {
    if (mapReady && !initialSearchDoneRef.current && !position) {
      initialSearchDoneRef.current = true;
      
      // Priority: initialSearchQuery > defaultWilaya
      const searchTerm = initialSearchQuery || defaultWilaya;
      if (searchTerm) {
        setSearchQuery(searchTerm);
        handleSearch(searchTerm);
      }
    }
  }, [initialSearchQuery, defaultWilaya, mapReady, position]);

  // Invalidate map size when it becomes visible (e.g. inside Collapsible)
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    // Small delay to let CSS transitions finish
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 300);
    return () => clearTimeout(timer);
  }, [mapReady]);

  // Update marker when position changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    if (position) {
      if (markerRef.current) {
        markerRef.current.setLatLng(position);
      } else {
        markerRef.current = L.marker(position).addTo(mapRef.current);
      }
      mapRef.current.flyTo(position, 15, { duration: 1 });
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [position, mapReady]);

  // Generate detailed address from coordinates
  const generateDetailedAddress = async (lat: number, lng: number): Promise<string> => {
    const plusCode = OpenLocationCode.encode(lat, lng, 10);
    const shortCode = plusCode.substring(4);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      const data = await response.json();
      const addr = data.address || {};
      
      // Build detailed address parts
      const parts: string[] = [];
      
      // Street / road
      const street = addr.road || addr.pedestrian || addr.footway || '';
      if (street) parts.push(street);
      
      // Neighbourhood / quarter
      const neighbourhood = addr.neighbourhood || addr.suburb || addr.quarter || '';
      if (neighbourhood) parts.push(neighbourhood);
      
      // Town / city / village (municipality)
      const municipality = addr.town || addr.city || addr.village || addr.municipality || '';
      if (municipality) parts.push(municipality);
      
      // County / district
      const county = addr.county || addr.state_district || '';
      if (county && county !== municipality) parts.push(county);
      
      // State (wilaya)
      const state = addr.state || '';
      if (state && state !== county && state !== municipality) parts.push(state);
      
      if (parts.length > 0) {
        return `${shortCode} - ${parts.join('، ')}`;
      }
      
      return shortCode;
    } catch (error) {
      console.error('Error generating address:', error);
      return shortCode;
    }
  };

  const handleLocationSelect = useCallback(async (lat: number, lng: number) => {
    setPosition([lat, lng]);
    setShowResults(false);
    
    // Immediately notify parent with coordinates (no address yet)
    onLocationChange(lat, lng);
    
    // Then generate address asynchronously and update
    try {
      const plusCodeAddress = await generateDetailedAddress(lat, lng);
      onLocationChange(lat, lng, plusCodeAddress);
    } catch (e) {
      console.error('Address generation failed:', e);
    }
  }, [onLocationChange]);

  // Keep ref in sync so map click handler always uses latest version
  useEffect(() => {
    handleLocationSelectRef.current = handleLocationSelect;
  }, [handleLocationSelect]);

  const handleSearch = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=dz&limit=5&accept-language=ar`
      );
      const data: SearchResult[] = await response.json();
      setSearchResults(data);
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value);
    }, 500);
  };

  const handleResultSelect = async (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setPosition([lat, lng]);
    setShowResults(false);
    
    // Generate Plus Code address like Google Maps
    const plusCodeAddress = await generateDetailedAddress(lat, lng);
    setSearchQuery(plusCodeAddress);
    onLocationChange(lat, lng, plusCodeAddress);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    
    // Use watchPosition to get progressively more accurate readings
    let bestPosition: GeolocationPosition | null = null;
    let settled = false;
    
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        console.log('📍 GPS Reading:', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy + 'm',
        });
        // Keep the most accurate reading
        if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = pos;
          // Update map marker in real-time as accuracy improves
          setPosition([pos.coords.latitude, pos.coords.longitude]);
        }
        // If accuracy is good enough (<50m), settle immediately
        if (pos.coords.accuracy <= 50 && !settled) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          finalizeBestPosition(bestPosition!);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        if (!settled) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          if (bestPosition) {
            finalizeBestPosition(bestPosition);
          } else {
            setIsLocating(false);
          }
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    
    // After 6 seconds, use whatever best position we have
    setTimeout(() => {
      if (!settled) {
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        if (bestPosition) {
          finalizeBestPosition(bestPosition);
        } else {
          setIsLocating(false);
        }
      }
    }, 6000);
  };

  const finalizeBestPosition = async (pos: GeolocationPosition) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    setPosition([lat, lng]);
    
    // Immediately notify parent with coordinates
    onLocationChange(lat, lng);
    
    // Then generate address asynchronously and update
    try {
      const plusCodeAddress = await generateDetailedAddress(lat, lng);
      onLocationChange(lat, lng, plusCodeAddress);
    } catch (error) {
      console.error('Error generating address:', error);
    } finally {
      setIsLocating(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (searchQuery.trim()) {
        handleSearch(searchQuery.trim());
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Search Input - positioned relative with high z-index for dropdown */}
      <div className="relative z-[2000]">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('customers.search_location') || 'ابحث عن موقع...'}
              className="pe-10 text-right"
              dir="rtl"
            />
            <div className="absolute start-3 top-1/2 -translate-y-1/2">
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <Search className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="default"
            size="icon"
            onClick={() => {
              if (searchQuery.trim()) {
                handleSearch(searchQuery.trim());
              }
            }}
            disabled={!searchQuery.trim() || isSearching}
            title="البحث عن العنوان"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleGetCurrentLocation}
            disabled={isLocating}
            title={t('customers.current_location') || 'موقعي الحالي'}
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-[2001] w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((result, index) => (
              <button
                key={index}
                type="button"
                className="w-full px-3 py-2 text-right text-sm hover:bg-accent transition-colors border-b last:border-0"
                onClick={() => handleResultSelect(result)}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{result.display_name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="relative h-64 rounded-lg overflow-hidden border">
        <div ref={mapContainerRef} className="h-full w-full" />
        
        {/* Instructions overlay */}
        {!position && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 pointer-events-none z-[1000]">
            <div className="bg-background/90 px-4 py-2 rounded-lg text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {t('customers.click_to_select') || 'انقر على الخريطة لتحديد الموقع'}
            </div>
          </div>
        )}
      </div>

      {/* Selected Location Info */}
      {position && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 px-3 py-2 rounded-lg">
          <MapPin className="w-4 h-4 text-primary" />
          <span dir="ltr">{position[0].toFixed(6)}, {position[1].toFixed(6)}</span>
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
