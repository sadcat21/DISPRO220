import React, { useState, useMemo } from 'react';
import { CalendarCheck, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import TodayCustomersDialog from './TodayCustomersDialog';
import DebtCollectionsPopover from '@/components/debts/DebtCollectionsPopover';
import { isAdminRole } from '@/lib/utils';
import { useSectorCoverage } from '@/hooks/useSectorCoverage';

const JS_DAY_TO_NAME: Record<number, string> = {
  6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
};

const SectorCustomersPopover: React.FC = () => {
  const { workerId, activeBranch, role } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const isAdmin = isAdminRole(role) || role === 'supervisor';

  // Sector coverage for substitute workers
  const { getActiveCoveragesForDate } = useSectorCoverage();
  const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Check if there are scheduled sectors today for badge count
  const { data: todayCount = 0 } = useQuery({
    queryKey: ['sector-customers-count', workerId, activeBranch?.id, todayName, todayDateStr],
    queryFn: async () => {
      // Get sector schedules for today
      const { data: schedules } = await supabase
        .from('sector_schedules')
        .select('sector_id, worker_id, schedule_type')
        .eq('day', todayName);

      // Get active coverages for today
      const activeCoverages = getActiveCoveragesForDate(todayDateStr);

      if (!schedules || schedules.length === 0) {
        // Fallback to legacy fields
        let query = supabase.from('sectors').select('id, visit_day_delivery, visit_day_sales, sales_worker_id, delivery_worker_id');
        if (activeBranch && role === 'branch_admin') query = query.eq('branch_id', activeBranch.id);

        const { data: legacySectors } = await query.or(`visit_day_delivery.eq.${todayName},visit_day_sales.eq.${todayName}`);

        if (isAdmin) {
          return (legacySectors || []).length > 0 || activeCoverages.length > 0 ? 1 : 0;
        }

        // For worker: check own sectors + coverages where worker is substitute
        const hasOwnSectors = (legacySectors || []).some(
          s => s.sales_worker_id === workerId || s.delivery_worker_id === workerId
        );
        const isCovering = activeCoverages.some(c => c.substitute_worker_id === workerId);
        return (hasOwnSectors || isCovering) ? 1 : 0;
      }

      if (isAdmin) return schedules.length > 0 || activeCoverages.length > 0 ? 1 : 0;

      // For worker: check own schedules (excluding sectors where worker is absent) + coverages
      const absentSectorKeys = new Set(
        activeCoverages
          .filter(c => c.absent_worker_id === workerId)
          .map(c => `${c.sector_id}:${c.schedule_type}`)
      );
      const activeOwnSchedules = schedules.filter(s => 
        s.worker_id === workerId && !absentSectorKeys.has(`${s.sector_id}:${s.schedule_type}`)
      );

      // Check if this worker is covering for someone today
      const coveringForSomeone = activeCoverages.some(c => {
        if (c.substitute_worker_id !== workerId) return false;
        const daySchedules = schedules.filter(
          sc => sc.sector_id === c.sector_id && sc.schedule_type === c.schedule_type
        );
        return daySchedules.length > 0;
      });

      return (activeOwnSchedules.length > 0 || coveringForSomeone) ? 1 : 0;
    },
    enabled: !!workerId,
  });

  return (
    <>
      <div className="flex items-center gap-0.5">
        <DebtCollectionsPopover />
        <button
          onClick={() => setDialogOpen(true)}
          className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
          title="عملاء اليوم"
        >
          <CalendarCheck className="w-4 h-4 text-emerald-600" />
          {todayCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
          )}
        </button>
      </div>

      <TodayCustomersDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
};

export default SectorCustomersPopover;
