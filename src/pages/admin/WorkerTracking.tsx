import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSearchParams } from 'react-router-dom';
import WorkerTrackingMap from '@/components/map/WorkerTrackingMap';
import { Switch } from '@/components/ui/switch';
import { Users, Settings, Store, Plus, Minus, MapPin, Clock, Route } from 'lucide-react';
import { useWorkerLocations, WorkerStopRecord } from '@/hooks/useWorkerLocation';
import { useTrackableWorkers } from '@/components/map/TrackingSettingsDialog';
import TrackingSettingsDialog from '@/components/map/TrackingSettingsDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

const WorkerTracking: React.FC = () => {
  const { t, dir } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightWorkerId = searchParams.get('worker') || undefined;
  const [showAll, setShowAll] = useState(!highlightWorkerId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showNearbyCustomers, setShowNearbyCustomers] = useState(false);
  const [nearbyDistance, setNearbyDistance] = useState(500);
  const [showStopsRoute, setShowStopsRoute] = useState(false);
  const { data: allWorkers } = useWorkerLocations();
  const { data: trackableIds } = useTrackableWorkers();

  const workers = allWorkers?.filter(w =>
    trackableIds === null || trackableIds === undefined || trackableIds.includes(w.worker_id)
  );

  const selectedWorkerStops: WorkerStopRecord[] = useMemo(() => {
    if (!highlightWorkerId || !workers) return [];
    const w = workers.find(w => w.worker_id === highlightWorkerId);
    return (w?.stops || []) as WorkerStopRecord[];
  }, [highlightWorkerId, workers]);

  const selectWorker = (workerId: string) => {
    if (workerId === highlightWorkerId) {
      setSearchParams({});
      setShowAll(true);
      setShowStopsRoute(false);
    } else {
      setSearchParams({ worker: workerId });
      setShowAll(false);
      setShowStopsRoute(false);
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
              <span className="text-sm text-muted-foreground">{t('tracking.all_workers')}</span>
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
            <span className="text-sm text-muted-foreground">{t('tracking.nearby_customers')}</span>
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
        showStopsRoute={showStopsRoute && !!highlightWorkerId}
        stops={selectedWorkerStops}
      />

      {/* Worker stops trail section */}
      {highlightWorkerId && (
        <div className="space-y-2" dir={dir}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">{t('tracking.worker_route')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('tracking.draw_route')}</span>
              <Switch checked={showStopsRoute} onCheckedChange={setShowStopsRoute} />
            </div>
          </div>

          {selectedWorkerStops.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm bg-muted/50 rounded-lg">
              <Clock className="w-5 h-5 mx-auto mb-1 opacity-40" />
              {t('tracking.no_stops')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {selectedWorkerStops
                .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
                .map((stop, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50 border text-sm"
                  >
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                        {idx + 1}
                      </div>
                      {idx < selectedWorkerStops.length - 1 && (
                        <div className="w-0.5 h-4 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(stop.started_at), 'HH:mm')}
                          {stop.ended_at && ` → ${format(new Date(stop.ended_at), 'HH:mm')}`}
                        </span>
                        <span className="text-xs font-semibold text-amber-600">
                          ⏸ {stop.duration_min} د
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        <MapPin className="w-3 h-3 inline-block ml-1" />
                        {stop.address || `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <TrackingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default WorkerTracking;
