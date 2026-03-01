import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import WorkerTrackingMap from '@/components/map/WorkerTrackingMap';

const WorkerTracking: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('navigation.tracking_title')}</h2>
      <WorkerTrackingMap />
    </div>
  );
};

export default WorkerTracking;
