import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface LazyLocationPickerProps {
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
  initialSearchQuery?: string;
  addressToSearch?: string;
  defaultWilaya?: string;
}

// This wrapper component ensures the map is only loaded after mount
// to avoid react-leaflet context issues with Suspense
const LazyLocationPicker: React.FC<LazyLocationPickerProps> = (props) => {
  const [LocationPicker, setLocationPicker] = useState<React.ComponentType<LazyLocationPickerProps> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    // Dynamic import after component mount
    import('./LocationPicker').then((module) => {
      if (mounted) {
        setLocationPicker(() => module.default);
        setIsLoading(false);
      }
    }).catch((error) => {
      console.error('Error loading LocationPicker:', error);
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading || !LocationPicker) {
    return (
      <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return <LocationPicker {...props} />;
};

export default LazyLocationPicker;
