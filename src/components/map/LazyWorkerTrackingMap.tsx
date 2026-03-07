import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface LazyWorkerTrackingMapProps {
  highlightWorkerId?: string;
  trackableWorkerIds?: string[];
}

const LazyWorkerTrackingMap: React.FC<LazyWorkerTrackingMapProps> = ({ highlightWorkerId }) => {
  const [WorkerTrackingMap, setWorkerTrackingMap] = useState<React.ComponentType<any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    import('./WorkerTrackingMap').then((module) => {
      if (mounted) {
        setWorkerTrackingMap(() => module.default);
        setIsLoading(false);
      }
    }).catch((error) => {
      console.error('Error loading WorkerTrackingMap:', error);
      if (mounted) setIsLoading(false);
    });

    return () => { mounted = false; };
  }, []);

  if (isLoading || !WorkerTrackingMap) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <WorkerTrackingMap highlightWorkerId={highlightWorkerId} />;
};

export default LazyWorkerTrackingMap;
