import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MapPin, Ruler, Trash2, Map, UserCog } from 'lucide-react';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WorkerAttendanceLocationDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { workerId: currentWorkerId } = useAuth();
  const queryClient = useQueryClient();

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [maxDistance, setMaxDistance] = useState('50');
  const [label, setLabel] = useState('');
  const [showMap, setShowMap] = useState(false);

  // Fetch workers
  const { data: workers = [] } = useQuery({
    queryKey: ['workers-list-attendance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers_safe')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch existing worker attendance locations
  const { data: existingLocations = [] } = useQuery({
    queryKey: ['worker-attendance-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_attendance_locations')
        .select('*');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // When worker selected, load their existing location
  useEffect(() => {
    if (selectedWorkerId) {
      const existing = existingLocations.find((l: any) => l.worker_id === selectedWorkerId);
      if (existing) {
        setLatitude(String(existing.latitude));
        setLongitude(String(existing.longitude));
        setMaxDistance(String(existing.max_distance_meters));
        setLabel(existing.label || '');
      } else {
        setLatitude('');
        setLongitude('');
        setMaxDistance('50');
        setLabel('');
      }
    }
  }, [selectedWorkerId, existingLocations]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkerId || !latitude || !longitude) throw new Error('missing');

      const { error } = await supabase
        .from('worker_attendance_locations')
        .upsert({
          worker_id: selectedWorkerId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          max_distance_meters: parseInt(maxDistance) || 50,
          label: label || null,
          set_by: currentWorkerId || null,
        }, { onConflict: 'worker_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-attendance-locations'] });
      queryClient.invalidateQueries({ queryKey: ['branch-location'] });
      toast.success('تم حفظ موقع المداومة للعامل');
    },
    onError: () => toast.error('فشل في حفظ الموقع'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('worker_attendance_locations')
        .delete()
        .eq('worker_id', selectedWorkerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-attendance-locations'] });
      queryClient.invalidateQueries({ queryKey: ['branch-location'] });
      setLatitude('');
      setLongitude('');
      setMaxDistance('50');
      setLabel('');
      toast.success('تم حذف الموقع المخصص - سيستخدم العامل موقع المخزن الافتراضي');
    },
    onError: () => toast.error('فشل في حذف الموقع'),
  });

  const hasExisting = existingLocations.some((l: any) => l.worker_id === selectedWorkerId);

  const useCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        toast.success('تم التقاط الموقع الحالي');
      },
      () => toast.error('تعذر تحديد الموقع')
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            تخصيص موقع مداومة لعامل
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Worker Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">اختر العامل</Label>
            <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر عامل..." />
              </SelectTrigger>
              <SelectContent>
                {workers.map((w: any) => {
                  const hasLoc = existingLocations.some((l: any) => l.worker_id === w.id);
                  return (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name} {hasLoc ? '📍' : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedWorkerId && (
            <>
              {/* Label */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">اسم الموقع (اختياري)</Label>
                <Input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="مثلاً: نقطة البيع - شارع X"
                />
              </div>

              {/* Max Distance */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Ruler className="w-4 h-4 text-muted-foreground" />
                  أقصى مسافة مسموحة (متر)
                </Label>
                <Input
                  type="number"
                  min={10}
                  max={10000}
                  value={maxDistance}
                  onChange={e => setMaxDistance(e.target.value)}
                  placeholder="50"
                />
              </div>

              {/* Coordinates */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  إحداثيات الموقع
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step="0.000001"
                    value={latitude}
                    onChange={e => setLatitude(e.target.value)}
                    placeholder="خط العرض"
                  />
                  <Input
                    type="number"
                    step="0.000001"
                    value={longitude}
                    onChange={e => setLongitude(e.target.value)}
                    placeholder="خط الطول"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={useCurrentLocation}>
                    <MapPin className="w-3.5 h-3.5 ml-1" />
                    موقعي الحالي
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setShowMap(!showMap)}>
                    <Map className="w-3.5 h-3.5 ml-1" />
                    {showMap ? 'إخفاء الخريطة' : 'اختيار من الخريطة'}
                  </Button>
                </div>

                {showMap && (
                  <div className="rounded-xl overflow-hidden border">
                    <LazyLocationPicker
                      latitude={latitude ? parseFloat(latitude) : null}
                      longitude={longitude ? parseFloat(longitude) : null}
                      onLocationChange={(lat, lng) => {
                        setLatitude(lat.toFixed(6));
                        setLongitude(lng.toFixed(6));
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !latitude || !longitude}
                >
                  {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ الموقع'}
                </Button>
                {hasExisting && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    title="حذف الموقع المخصص"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerAttendanceLocationDialog;
