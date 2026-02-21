import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface LazyCustomerLocationViewProps {
  latitude: number;
  longitude: number;
  customerName?: string;
  address?: string;
}

// This wrapper component ensures the map is only loaded after mount
// to avoid react-leaflet context issues with Suspense
const LazyCustomerLocationView: React.FC<LazyCustomerLocationViewProps> = (props) => {
  const [CustomerLocationView, setCustomerLocationView] = useState<React.ComponentType<LazyCustomerLocationViewProps> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    // Dynamic import after component mount
    import('./CustomerLocationView').then((module) => {
      if (mounted) {
        setCustomerLocationView(() => module.default);
        setIsLoading(false);
      }
    }).catch((error) => {
      console.error('Error loading CustomerLocationView:', error);
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading || !CustomerLocationView) {
    return (
      <div className="h-48 flex items-center justify-center bg-muted rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return <CustomerLocationView {...props} />;
};

export default LazyCustomerLocationView;
