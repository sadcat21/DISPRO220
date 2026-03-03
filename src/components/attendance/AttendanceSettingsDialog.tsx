import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Settings2, MapPin, Ruler, Clock, Map } from 'lucide-react';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AttendanceSettingsDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();

  const [maxDistance, setMaxDistance] = useState('50');
  const [warehouseLat, setWarehouseLat] = useState('');
  const [warehouseLng, setWarehouseLng] = useState('');
  const [workStartTime, setWorkStartTime] = useState('08:00');
  const [gracePeriod, setGracePeriod] = useState('0');
  const [showMap, setShowMap] = useState(false);

  const branchId = activeBranch?.id || null;

  const { data: settings, isLoading } = useQuery({
    queryKey: ['attendance-settings', branchId],
    queryFn: async () => {
      const keys = ['warehouse_latitude', 'warehouse_longitude', 'attendance_max_distance', 'work_start_time', 'attendance_grace_period'];
      
      // Try branch-specific first
      let { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys)
        .eq('branch_id', branchId || '');
      
      // Fallback to global
      if (!data || data.length === 0) {
        const res = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', keys)
          .is('branch_id', null);
        data = res.data;
      }

      const map: Record<string, string> = {};
      data?.forEach(d => { map[d.key] = d.value; });
      return map;
    },
    enabled: open,
  });

  useEffect(() => {
    if (settings) {
      setWarehouseLat(settings['warehouse_latitude'] || '35.90775');
      setWarehouseLng(settings['warehouse_longitude'] || '0.10253');
      setMaxDistance(settings['attendance_max_distance'] || '50');
      setWorkStartTime(settings['work_start_time'] || '08:00');
      setGracePeriod(settings['attendance_grace_period'] || '0');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = [
        { key: 'warehouse_latitude', value: warehouseLat },
        { key: 'warehouse_longitude', value: warehouseLng },
        { key: 'attendance_max_distance', value: maxDistance },
        { key: 'work_start_time', value: workStartTime },
        { key: 'attendance_grace_period', value: gracePeriod },
      ];

      for (const entry of entries) {
        // Check if exists
        const { data: existing } = await supabase
          .from('app_settings')
          .select('id')
          .eq('key', entry.key)
          .eq('branch_id', branchId || '')
          .maybeSingle();

        if (existing) {
          await supabase.from('app_settings').update({
            value: entry.value,
            updated_by: workerId || null,
          }).eq('id', existing.id);
        } else {
          await supabase.from('app_settings').insert({
            key: entry.key,
            value: entry.value,
            branch_id: branchId,
            updated_by: workerId || null,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-settings'] });
      queryClient.invalidateQueries({ queryKey: ['branch-location'] });
      toast.success('تم حفظ إعدادات المداومة');
      onOpenChange(false);
    },
    onError: () => toast.error('فشل في حفظ الإعدادات'),
  });

  const useCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWarehouseLat(pos.coords.latitude.toFixed(6));
        setWarehouseLng(pos.coords.longitude.toFixed(6));
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
            <Settings2 className="w-5 h-5 text-primary" />
            إعدادات المداومة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Work Start Time */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4 text-muted-foreground" />
              توقيت بداية العمل
            </Label>
            <Input
              type="time"
              value={workStartTime}
              onChange={e => setWorkStartTime(e.target.value)}
            />
          </div>

          {/* Grace Period */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4 text-muted-foreground" />
              هامش التأخير (دقيقة)
            </Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={gracePeriod}
              onChange={e => setGracePeriod(e.target.value)}
              placeholder="0"
            />
            <p className="text-[11px] text-muted-foreground">
              لا يُحتسب تأخير خلال هذه المدة بعد توقيت بداية العمل
            </p>
          </div>

          {/* Max Distance */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Ruler className="w-4 h-4 text-muted-foreground" />
              أقصى مسافة عن المخزن (متر)
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

          {/* Warehouse Location */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              موقع المخزن
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.000001"
                value={warehouseLat}
                onChange={e => setWarehouseLat(e.target.value)}
                placeholder="خط العرض"
              />
              <Input
                type="number"
                step="0.000001"
                value={warehouseLng}
                onChange={e => setWarehouseLng(e.target.value)}
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
                  latitude={warehouseLat ? parseFloat(warehouseLat) : null}
                  longitude={warehouseLng ? parseFloat(warehouseLng) : null}
                  onLocationChange={(lat, lng) => {
                    setWarehouseLat(lat.toFixed(6));
                    setWarehouseLng(lng.toFixed(6));
                  }}
                />
              </div>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AttendanceSettingsDialog;
