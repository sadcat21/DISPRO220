import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import LazyWorkerTrackingMap from '@/components/map/LazyWorkerTrackingMap';

const WorkerTracking: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('navigation.tracking_title')}</h2>
      <LazyWorkerTrackingMap />
    </div>
  );
};

export default WorkerTracking;
