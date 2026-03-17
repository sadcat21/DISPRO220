import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, MapPin, Loader2, Store, Phone, Navigation, 
  Building2, ShoppingCart, RefreshCw, UserPlus, Check, AlertTriangle, Filter, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { isAdminRole } from '@/lib/utils';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom store icon
const storeIcon = L.divIcon({
  html: `<div style="background-color: #DC2626; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
      <path d="M2 7h20"/>
      <path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>
    </svg>
  </div>`,
  className: 'store-marker',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

interface NearbyStore {
  id: number;
  name: string;
  address: string;
  phone?: string;
  lat: number;
  lon: number;
  type: string;
  distance?: number; // Distance in meters from search location
}

interface SearchLocation {
  lat: number;
  lon: number;
  display_name: string;
  type?: string;
}

const NearbyStores: React.FC = () => {
  const { t } = useLanguage();
  const { workerId, activeBranch, role } = useAuth();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SearchLocation | null>(null);
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [savingStoreId, setSavingStoreId] = useState<number | null>(null);
  const [savedStoreIds, setSavedStoreIds] = useState<Set<number>>(new Set());
  const [apiError, setApiError] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchRadius, setSearchRadius] = useState<number>(2000);
  const initialLoadDone = useRef(false);

  // Search radius options
  const radiusOptions = [
    { value: 500, label: '500 متر' },
    { value: 1000, label: '1 كم' },
    { value: 2000, label: '2 كم' },
    { value: 5000, label: '5 كم' },
  ];
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Use activeBranch automatically for admins
  const effectiveBranchId = isAdminRole(role) && activeBranch ? activeBranch.id : null;

  // Get coordinates from URL params
  const urlLat = searchParams.get('lat');
  const urlLng = searchParams.get('lng');

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Format distance for display
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} م`;
    }
    return `${(meters / 1000).toFixed(1)} كم`;
  };

  // Handle map click for location selection
  const handleMapClick = useCallback(async (lat: number, lon: number) => {
    // Clear previous markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const location: SearchLocation = {
      lat,
      lon,
      display_name: `موقع محدد (${lat.toFixed(4)}, ${lon.toFixed(4)})`
    };
    setSelectedLocation(location);
    setSearchQuery(location.display_name);

    // Add marker for clicked location
    if (mapRef.current) {
      const locationMarker = L.marker([lat, lon])
        .addTo(mapRef.current)
        .bindPopup(`<div class="text-right" dir="rtl"><strong>الموقع المحدد</strong><br/><small>انقر للبحث عن المحلات</small></div>`)
        .openPopup();
      markersRef.current.push(locationMarker);
    }

    // Search for nearby stores
    searchNearbyStores(lat, lon);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [28.0339, 1.6596], // Algeria center
      zoom: 5,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Add click handler for map
    map.on('click', (e: L.LeafletMouseEvent) => {
      handleMapClick(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [handleMapClick]);

  // Search for location - prioritize cities and populated places
  const handleSearch = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      // Add featuretype parameter to prioritize cities/towns
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=dz&limit=10&accept-language=ar&addressdetails=1`
      );
      const data: any[] = await response.json();
      
      // Sort results to prioritize cities, towns, and villages over administrative boundaries
      const priorityTypes = ['city', 'town', 'village', 'suburb', 'neighbourhood', 'hamlet'];
      const sortedData = data.sort((a, b) => {
        const aType = a.type || '';
        const bType = b.type || '';
        const aPriority = priorityTypes.indexOf(aType);
        const bPriority = priorityTypes.indexOf(bType);
        
        // If both are priority types, sort by their priority order
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        // If only one is a priority type, it comes first
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        // Otherwise, keep original order
        return 0;
      }).slice(0, 5);
      
      setSearchResults(sortedData.map(item => ({
        lat: parseFloat(item.lat as any),
        lon: parseFloat(item.lon as any),
        display_name: item.display_name,
        type: item.type
      })));
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('حدث خطأ في البحث');
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

  // Search for nearby stores using Overpass API
  const searchNearbyStores = useCallback(async (lat: number, lon: number, retryCount = 0, radius = searchRadius) => {
    setIsLoadingStores(true);
    setStores([]);
    setApiError(null);

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    try {
      // Overpass API query for shops - comprehensive list of food and retail stores
      const query = `
        [out:json][timeout:45];
        (
          // Supermarkets and large stores
          node["shop"="supermarket"](around:${radius},${lat},${lon});
          node["shop"="hypermarket"](around:${radius},${lat},${lon});
          node["shop"="department_store"](around:${radius},${lat},${lon});
          node["shop"="mall"](around:${radius},${lat},${lon});
          node["shop"="wholesale"](around:${radius},${lat},${lon});
          
          // Convenience and general stores
          node["shop"="convenience"](around:${radius},${lat},${lon});
          node["shop"="general"](around:${radius},${lat},${lon});
          node["shop"="variety_store"](around:${radius},${lat},${lon});
          node["shop"="kiosk"](around:${radius},${lat},${lon});
          node["shop"="newsagent"](around:${radius},${lat},${lon});
          
          // Food stores
          node["shop"="grocery"](around:${radius},${lat},${lon});
          node["shop"="greengrocer"](around:${radius},${lat},${lon});
          node["shop"="bakery"](around:${radius},${lat},${lon});
          node["shop"="butcher"](around:${radius},${lat},${lon});
          node["shop"="deli"](around:${radius},${lat},${lon});
          node["shop"="dairy"](around:${radius},${lat},${lon});
          node["shop"="cheese"](around:${radius},${lat},${lon});
          node["shop"="seafood"](around:${radius},${lat},${lon});
          node["shop"="frozen_food"](around:${radius},${lat},${lon});
          node["shop"="pasta"](around:${radius},${lat},${lon});
          node["shop"="spices"](around:${radius},${lat},${lon});
          node["shop"="health_food"](around:${radius},${lat},${lon});
          node["shop"="organic"](around:${radius},${lat},${lon});
          
          // Drinks and beverages
          node["shop"="beverages"](around:${radius},${lat},${lon});
          node["shop"="coffee"](around:${radius},${lat},${lon});
          node["shop"="tea"](around:${radius},${lat},${lon});
          node["shop"="water"](around:${radius},${lat},${lon});
          
          // Confectionery
          node["shop"="confectionery"](around:${radius},${lat},${lon});
          node["shop"="chocolate"](around:${radius},${lat},${lon});
          node["shop"="pastry"](around:${radius},${lat},${lon});
          
          // Markets
          node["amenity"="marketplace"](around:${radius},${lat},${lon});
          
          // Ways (buildings/areas)
          way["shop"="supermarket"](around:${radius},${lat},${lon});
          way["shop"="hypermarket"](around:${radius},${lat},${lon});
          way["shop"="mall"](around:${radius},${lat},${lon});
          way["shop"="department_store"](around:${radius},${lat},${lon});
          way["shop"="convenience"](around:${radius},${lat},${lon});
          way["shop"="grocery"](around:${radius},${lat},${lon});
          way["shop"="general"](around:${radius},${lat},${lon});
          way["shop"="greengrocer"](around:${radius},${lat},${lon});
          way["shop"="wholesale"](around:${radius},${lat},${lon});
          way["amenity"="marketplace"](around:${radius},${lat},${lon});
          
          // Relations (large complexes)
          relation["shop"="mall"](around:${radius},${lat},${lon});
          relation["amenity"="marketplace"](around:${radius},${lat},${lon});
        );
        out body center;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      const storesList: NearbyStore[] = data.elements.map((element: any) => {
        const storeLat = element.lat || element.center?.lat;
        const storeLon = element.lon || element.center?.lon;
        
        // Build address from available tags
        const addressParts = [];
        if (element.tags?.['addr:street']) addressParts.push(element.tags['addr:street']);
        if (element.tags?.['addr:city']) addressParts.push(element.tags['addr:city']);
        if (element.tags?.['addr:district']) addressParts.push(element.tags['addr:district']);
        if (element.tags?.['addr:full']) addressParts.push(element.tags['addr:full']);
        
        const address = addressParts.length > 0 
          ? addressParts.join(' - ') 
          : (element.tags?.['addr:housenumber'] ? `رقم ${element.tags['addr:housenumber']}` : 'العنوان غير متوفر');

        // Determine store type - comprehensive categorization
        let type = 'محل';
        let typeKey = 'other';
        const shopType = element.tags?.shop;
        const amenityType = element.tags?.amenity;
        
        // Large retail stores
        if (shopType === 'supermarket') { type = 'سوبرماركت'; typeKey = 'supermarket'; }
        else if (shopType === 'hypermarket') { type = 'هايبرماركت'; typeKey = 'supermarket'; }
        else if (shopType === 'wholesale') { type = 'جملة'; typeKey = 'supermarket'; }
        else if (shopType === 'mall') { type = 'مركز تسوق'; typeKey = 'mall'; }
        else if (shopType === 'department_store') { type = 'متجر كبير'; typeKey = 'mall'; }
        
        // Convenience and general stores
        else if (shopType === 'convenience') { type = 'بقالة'; typeKey = 'convenience'; }
        else if (shopType === 'general') { type = 'محل عام'; typeKey = 'convenience'; }
        else if (shopType === 'variety_store') { type = 'متجر متنوع'; typeKey = 'convenience'; }
        else if (shopType === 'kiosk') { type = 'كشك'; typeKey = 'convenience'; }
        else if (shopType === 'newsagent') { type = 'بائع صحف'; typeKey = 'convenience'; }
        
        // Food stores
        else if (shopType === 'grocery') { type = 'محل مواد غذائية'; typeKey = 'grocery'; }
        else if (shopType === 'greengrocer') { type = 'خضار وفواكه'; typeKey = 'grocery'; }
        else if (shopType === 'bakery') { type = 'مخبزة'; typeKey = 'grocery'; }
        else if (shopType === 'butcher') { type = 'جزار'; typeKey = 'grocery'; }
        else if (shopType === 'deli') { type = 'أطعمة جاهزة'; typeKey = 'grocery'; }
        else if (shopType === 'dairy') { type = 'ألبان'; typeKey = 'grocery'; }
        else if (shopType === 'cheese') { type = 'أجبان'; typeKey = 'grocery'; }
        else if (shopType === 'seafood') { type = 'مأكولات بحرية'; typeKey = 'grocery'; }
        else if (shopType === 'frozen_food') { type = 'مجمدات'; typeKey = 'grocery'; }
        else if (shopType === 'pasta') { type = 'معجنات'; typeKey = 'grocery'; }
        else if (shopType === 'spices') { type = 'بهارات'; typeKey = 'grocery'; }
        else if (shopType === 'health_food') { type = 'أغذية صحية'; typeKey = 'grocery'; }
        else if (shopType === 'organic') { type = 'منتجات عضوية'; typeKey = 'grocery'; }
        
        // Beverages
        else if (shopType === 'beverages') { type = 'مشروبات'; typeKey = 'grocery'; }
        else if (shopType === 'coffee') { type = 'قهوة'; typeKey = 'grocery'; }
        else if (shopType === 'tea') { type = 'شاي'; typeKey = 'grocery'; }
        else if (shopType === 'water') { type = 'مياه'; typeKey = 'grocery'; }
        
        // Confectionery
        else if (shopType === 'confectionery') { type = 'حلويات'; typeKey = 'grocery'; }
        else if (shopType === 'chocolate') { type = 'شوكولاتة'; typeKey = 'grocery'; }
        else if (shopType === 'pastry') { type = 'حلويات ومعجنات'; typeKey = 'grocery'; }
        
        // Markets
        else if (amenityType === 'marketplace') { type = 'سوق'; typeKey = 'marketplace'; }

        // Calculate distance from search location
        const distance = calculateDistance(lat, lon, storeLat, storeLon);

        return {
          id: element.id,
          name: element.tags?.name || element.tags?.['name:ar'] || type,
          address,
          phone: element.tags?.phone || element.tags?.['contact:phone'],
          lat: storeLat,
          lon: storeLon,
          type,
          typeKey,
          distance,
        };
      }).filter((store: NearbyStore) => store.lat && store.lon)
        .sort((a, b) => (a.distance || 0) - (b.distance || 0)); // Sort by distance

      setStores(storesList);

      // Add markers to map
      if (mapRef.current) {
        storesList.forEach((store) => {
          const marker = L.marker([store.lat, store.lon], { icon: storeIcon })
            .addTo(mapRef.current!)
            .bindPopup(`
              <div class="text-right" dir="rtl">
                <strong>${store.name}</strong><br/>
                <span class="text-sm">${store.type}</span><br/>
                ${store.address !== 'العنوان غير متوفر' ? `<span class="text-xs">${store.address}</span><br/>` : ''}
                ${store.phone ? `<span class="text-xs">📞 ${store.phone}</span>` : ''}
              </div>
            `);
          markersRef.current.push(marker);
        });
      }

      if (storesList.length === 0) {
        toast.info('لم يتم العثور على محلات في هذه المنطقة');
      } else {
        toast.success(`تم العثور على ${storesList.length} محل`);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      
      // Auto retry once
      if (retryCount < 1) {
        toast.info('جاري إعادة المحاولة...');
        setTimeout(() => searchNearbyStores(lat, lon, retryCount + 1), 2000);
        return;
      }
      
      // Show error with retry option
      setApiError({ lat, lon });
      toast.error('فشل الاتصال بخدمة البحث. اضغط على "إعادة المحاولة"');
    } finally {
      setIsLoadingStores(false);
    }
  }, [searchRadius]);

  // Filter stores based on selected filter
  const filteredStores = selectedFilter === 'all' 
    ? stores 
    : stores.filter(store => {
        if (selectedFilter === 'supermarket') return store.type === 'سوبرماركت';
        if (selectedFilter === 'convenience') return store.type === 'بقالة';
        if (selectedFilter === 'grocery') return store.type === 'محل مواد غذائية';
        if (selectedFilter === 'marketplace') return store.type === 'سوق';
        return true;
      });

  // Export stores to CSV
  const exportToCSV = () => {
    if (filteredStores.length === 0) {
      toast.error('لا توجد محلات للتصدير');
      return;
    }

    const headers = ['الاسم', 'النوع', 'العنوان', 'الهاتف', 'خط العرض', 'خط الطول'];
    const csvContent = [
      headers.join(','),
      ...filteredStores.map(store => [
        `"${store.name.replace(/"/g, '""')}"`,
        `"${store.type}"`,
        `"${store.address.replace(/"/g, '""')}"`,
        `"${store.phone || ''}"`,
        store.lat,
        store.lon,
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `محلات-قريبة-${new Date().toLocaleDateString('ar-DZ')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`تم تصدير ${filteredStores.length} محل بنجاح`);
  };

  // Handle radius change
  const handleRadiusChange = (value: string) => {
    const newRadius = parseInt(value);
    setSearchRadius(newRadius);
    if (selectedLocation) {
      searchNearbyStores(selectedLocation.lat, selectedLocation.lon, 0, newRadius);
    }
  };

  // Auto-load from URL params
  useEffect(() => {
    if (urlLat && urlLng && mapReady && !initialLoadDone.current) {
      initialLoadDone.current = true;
      const lat = parseFloat(urlLat);
      const lng = parseFloat(urlLng);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        const location: SearchLocation = {
          lat,
          lon: lng,
          display_name: `الموقع المحدد (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        };
        setSelectedLocation(location);
        
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 14, { duration: 1 });
          
          // Add marker for selected location
          const marker = L.marker([lat, lng]).addTo(mapRef.current);
          marker.bindPopup('الموقع المحدد').openPopup();
        }
        
        // Search for nearby stores
        searchNearbyStores(lat, lng);
      }
    }
  }, [urlLat, urlLng, mapReady, searchNearbyStores]);

  const handleLocationSelect = (location: SearchLocation) => {
    setSelectedLocation(location);
    setSearchQuery(location.display_name);
    setShowResults(false);

    if (mapRef.current) {
      // Add location marker
      const locationMarker = L.marker([location.lat, location.lon])
        .addTo(mapRef.current)
        .bindPopup(`<div class="text-right" dir="rtl"><strong>الموقع المحدد</strong></div>`)
        .openPopup();
      markersRef.current.push(locationMarker);
      
      mapRef.current.flyTo([location.lat, location.lon], 14, { duration: 1 });
    }

    // Search for nearby stores
    searchNearbyStores(location.lat, location.lon);
  };

  const openInGoogleMaps = (store: NearbyStore) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`;
    window.open(url, '_blank');
  };

  // Save store as customer
  const saveAsCustomer = async (store: NearbyStore) => {
    if (!workerId) {
      toast.error('يجب تسجيل الدخول لحفظ العميل');
      return;
    }

    setSavingStoreId(store.id);
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          name: store.name,
          phone: store.phone || null,
          address: store.address !== 'العنوان غير متوفر' ? store.address : null,
          latitude: store.lat,
          longitude: store.lon,
          location_type: 'store',
          branch_id: effectiveBranchId,
          created_by: workerId,
        });

      if (error) throw error;

      setSavedStoreIds(prev => new Set(prev).add(store.id));
      toast.success(`تم حفظ "${store.name}" كعميل جديد ✓`);
    } catch (error: any) {
      console.error('Error saving customer:', error);
      toast.error(error.message || 'حدث خطأ في حفظ العميل');
    } finally {
      setSavingStoreId(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Store className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">البحث عن المحلات</h2>
          <p className="text-sm text-muted-foreground">ابحث عن محلات المواد الغذائية والسوبرماركت</p>
        </div>
      </div>

      {/* Search Input with Radius Selector */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="أدخل العنوان أو المنطقة للبحث..."
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
          <Select value={searchRadius.toString()} onValueChange={handleRadiusChange}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="النطاق" />
            </SelectTrigger>
            <SelectContent>
              {radiusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-[2000] w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((result, index) => (
              <button
                key={index}
                type="button"
                className="w-full px-3 py-2 text-right text-sm hover:bg-accent transition-colors border-b last:border-0"
                onClick={() => handleLocationSelect(result)}
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

      {/* API Error with Retry */}
      {apiError && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">فشل الاتصال بخدمة البحث</p>
                  <p className="text-sm text-muted-foreground">تحقق من اتصالك بالإنترنت وحاول مرة أخرى</p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => searchNearbyStores(apiError.lat, apiError.lon)}
                disabled={isLoadingStores}
              >
                <RefreshCw className={`w-4 h-4 ml-1 ${isLoadingStores ? 'animate-spin' : ''}`} />
                إعادة المحاولة
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Store Type Filters */}
      {stores.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFilter('all')}
            className="gap-1"
          >
            <Filter className="w-3 h-3" />
            الكل ({stores.length})
          </Button>
          {stores.some(s => s.type === 'سوبرماركت') && (
            <Button
              variant={selectedFilter === 'supermarket' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('supermarket')}
            >
              سوبرماركت ({stores.filter(s => s.type === 'سوبرماركت').length})
            </Button>
          )}
          {stores.some(s => s.type === 'بقالة') && (
            <Button
              variant={selectedFilter === 'convenience' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('convenience')}
            >
              بقالة ({stores.filter(s => s.type === 'بقالة').length})
            </Button>
          )}
          {stores.some(s => s.type === 'محل مواد غذائية') && (
            <Button
              variant={selectedFilter === 'grocery' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('grocery')}
            >
              مواد غذائية ({stores.filter(s => s.type === 'محل مواد غذائية').length})
            </Button>
          )}
          {stores.some(s => s.type === 'سوق') && (
            <Button
              variant={selectedFilter === 'marketplace' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('marketplace')}
            >
              سوق ({stores.filter(s => s.type === 'سوق').length})
            </Button>
          )}
        </div>
      )}

      {/* Map - Click to search */}
      <div className="relative h-64 rounded-lg overflow-hidden border">
        <div ref={mapContainerRef} className="h-full w-full cursor-crosshair" />
        
        {/* Click hint */}
        {!selectedLocation && !isLoadingStores && (
          <div className="absolute bottom-2 left-2 right-2 text-center">
            <Badge variant="secondary" className="bg-background/90 gap-1">
              <MapPin className="w-3 h-3" />
              انقر على الخريطة لاختيار موقع البحث
            </Badge>
          </div>
        )}
        
        {isLoadingStores && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-[1000]">
            <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-lg shadow">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>جاري البحث عن المحلات...</span>
            </div>
          </div>
        )}
      </div>

      {/* Results Stats */}
      {selectedLocation && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShoppingCart className="w-3 h-3" />
            {filteredStores.length} / {stores.length} محل
          </Badge>
          <div className="flex gap-2">
            {stores.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="gap-1"
              >
                <Download className="w-4 h-4" />
                تصدير CSV
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => searchNearbyStores(selectedLocation.lat, selectedLocation.lon)}
              disabled={isLoadingStores}
            >
              <RefreshCw className={`w-4 h-4 ml-1 ${isLoadingStores ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          </div>
        </div>
      )}

      {/* Stores List */}
      <div className="space-y-3">
        {filteredStores.map((store) => (
          <Card key={store.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold">{store.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {store.type}
                      </Badge>
                      {store.distance !== undefined && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Navigation className="w-3 h-3" />
                          {formatDistance(store.distance)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-start gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{store.address}</span>
                    </div>
                    {store.phone && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Phone className="w-3 h-3" />
                        <a href={`tel:${store.phone}`} className="hover:text-primary" dir="ltr">
                          {store.phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {savedStoreIds.has(store.id) ? (
                    <Button
                      variant="secondary"
                      size="icon"
                      disabled
                      className="bg-primary/20 text-primary border-primary/30"
                      title="تم الحفظ"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="icon"
                      onClick={() => saveAsCustomer(store)}
                      disabled={savingStoreId === store.id}
                      title="حفظ كعميل"
                    >
                      {savingStoreId === store.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openInGoogleMaps(store)}
                    title="فتح في خرائط جوجل"
                  >
                    <Navigation className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {selectedLocation && stores.length === 0 && !isLoadingStores && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>لم يتم العثور على محلات في هذه المنطقة</p>
            <p className="text-sm mt-1">جرب البحث في منطقة أخرى</p>
          </div>
        )}

        {!selectedLocation && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>ابحث عن منطقة للعثور على المحلات القريبة</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NearbyStores;
