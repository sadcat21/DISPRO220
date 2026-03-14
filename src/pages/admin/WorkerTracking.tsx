import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSearchParams } from 'react-router-dom';
import WorkerTrackingMap from '@/components/map/WorkerTrackingMap';
import { Switch } from '@/components/ui/switch';
import { Users, Settings, Store, Plus, Minus } from 'lucide-react';
import { useWorkerLocations } from '@/hooks/useWorkerLocation';
import { useTrackableWorkers } from '@/components/map/TrackingSettingsDialog';
import TrackingSettingsDialog from '@/components/map/TrackingSettingsDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

const WorkerTracking: React.FC = () => {
  const { t, dir } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightWorkerId = searchParams.get('worker') || undefined;
  const [showAll, setShowAll] = useState(!highlightWorkerId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showNearbyCustomers, setShowNearbyCustomers] = useState(false);
  const [nearbyDistance, setNearbyDistance] = useState(500); // meters
  const { data: allWorkers } = useWorkerLocations();
  const { data: trackableIds } = useTrackableWorkers();

  // Filter workers based on tracking settings
  const workers = allWorkers?.filter(w =>
    trackableIds === null || trackableIds === undefined || trackableIds.includes(w.worker_id)
  );

  const selectWorker = (workerId: string) => {
    if (workerId === highlightWorkerId) {
      setSearchParams({});
      setShowAll(true);
    } else {
      setSearchParams({ worker: workerId });
      setShowAll(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between" dir={dir}>
        <h2 className="text-xl font-bold">{t('navigation.tracking_title')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-5 h-5" />
          </Button>
          {highlightWorkerId && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">كل العمال</span>
              <Switch checked={showAll} onCheckedChange={setShowAll} />
            </div>
          )}
        </div>
      </div>

      {/* Nearby customers toggle */}
      {highlightWorkerId && (
        <div className="flex items-center gap-2 flex-wrap" dir={dir}>
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">عملاء قريبون</span>
            <Switch checked={showNearbyCustomers} onCheckedChange={setShowNearbyCustomers} />
          </div>
          {showNearbyCustomers && (
            <div className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => setNearbyDistance(d => Math.max(100, d - 100))}
                disabled={nearbyDistance <= 100}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-xs font-bold min-w-[40px] text-center">{nearbyDistance} م</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => setNearbyDistance(d => Math.min(2000, d + 100))}
                disabled={nearbyDistance >= 2000}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Worker quick-pick strip */}
      {workers && workers.length > 0 && (
        <ScrollArea className="w-full" dir={dir}>
          <div className="flex gap-2 pb-2">
            {workers.map(w => {
              const isSelected = w.worker_id === highlightWorkerId;
              const isActive = w.is_tracking && w.has_location;
              return (
                <button
                  key={w.worker_id}
                  onClick={() => selectWorker(w.worker_id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors shrink-0
                    ${isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent text-foreground'}
                  `}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                  {w.worker_name || w.worker_id.slice(0, 6)}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      <WorkerTrackingMap
        key={highlightWorkerId || '__all__'}
        highlightWorkerId={highlightWorkerId}
        showOnlyHighlighted={!!highlightWorkerId && !showAll}
        trackableWorkerIds={trackableIds ?? undefined}
        showNearbyCustomers={showNearbyCustomers && !!highlightWorkerId}
        nearbyDistanceMeters={nearbyDistance}
      />

      <TrackingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default WorkerTracking;
