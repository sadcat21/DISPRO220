import React, { useState, useEffect } from 'react';
import { Customer } from '@/types/database';
import { Loader2 } from 'lucide-react';

interface CustomerWithLocationType extends Customer {
  location_type?: string | null;
}

interface LazyCustomersMapViewProps {
  customers: CustomerWithLocationType[];
  onCustomerClick?: (customer: CustomerWithLocationType) => void;
  branchWilaya?: string | null;
}

const LazyCustomersMapView: React.FC<LazyCustomersMapViewProps> = (props) => {
  const [CustomersMapView, setCustomersMapView] = useState<React.ComponentType<LazyCustomersMapViewProps> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    import('./CustomersMapView').then((module) => {
      if (mounted) {
        setCustomersMapView(() => module.default);
        setIsLoading(false);
      }
    }).catch((error) => {
      console.error('Error loading CustomersMapView:', error);
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading || !CustomersMapView) {
    return (
      <div className="h-48 flex items-center justify-center bg-muted rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return <CustomersMapView {...props} />;
};

export default LazyCustomersMapView;
