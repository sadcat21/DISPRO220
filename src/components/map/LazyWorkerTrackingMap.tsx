import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const WorkerTrackingMap = lazy(() => import('./WorkerTrackingMap'));

const LazyWorkerTrackingMap: React.FC = () => (
  <Suspense fallback={
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  }>
    <WorkerTrackingMap />
  </Suspense>
);

export default LazyWorkerTrackingMap;
