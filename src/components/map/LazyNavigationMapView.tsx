import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const NavigationMapView = lazy(() => import('./NavigationMapView'));

interface Props {
  destinationLat: number;
  destinationLng: number;
  customerName: string;
  address?: string;
  onClose: () => void;
}

const LazyNavigationMapView: React.FC<Props> = (props) => (
  <Suspense fallback={
    <div className="fixed inset-0 bg-background z-[9999] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  }>
    <NavigationMapView {...props} />
  </Suspense>
);

export default LazyNavigationMapView;
