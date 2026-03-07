import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSearchParams } from 'react-router-dom';
import WorkerTrackingMap from '@/components/map/WorkerTrackingMap';

const WorkerTracking: React.FC = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const highlightWorkerId = searchParams.get('worker') || undefined;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('navigation.tracking_title')}</h2>
      <WorkerTrackingMap key={highlightWorkerId || '__all__'} highlightWorkerId={highlightWorkerId} />
    </div>
  );
};

export default WorkerTracking;
