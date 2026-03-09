import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const AdminWorkerBar: React.FC = () => {
  const { role, activeBranch } = useAuth();
  const { workerId: selectedWorkerId, workerName: selectedWorkerName, setSelectedWorker, clearSelectedWorker } = useSelectedWorker();

  const isAdminOrBranchAdmin = role === 'admin' || role === 'branch_admin';

  const { data: workers } = useQuery({
    queryKey: ['workers-bar', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('workers')
        .select('id, full_name, username')
        .eq('is_active', true)
        .eq('role', 'worker')
        .order('full_name');

      if (activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isAdminOrBranchAdmin,
  });

  if (!isAdminOrBranchAdmin || !workers || workers.length === 0) return null;

  return (
    <div className="relative">
      {selectedWorkerId && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-1 -start-1 z-10 h-5 w-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80"
          onClick={clearSelectedWorker}
        >
          <X className="w-3 h-3" />
        </Button>
      )}
      <ScrollArea className="w-full" dir="rtl">
        <div className="flex gap-2 pb-1">
          {workers.map((w) => {
            const isSelected = w.id === selectedWorkerId;
            return (
              <button
                key={w.id}
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 min-w-[72px] transition-colors shrink-0
                  ${isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card border-border hover:bg-accent'
                  }`}
                onClick={() => {
                  if (isSelected) {
                    clearSelectedWorker();
                  } else {
                    setSelectedWorker(w.id, w.full_name);
                  }
                }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                  <User className={`w-4 h-4 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
                </div>
                <span className="text-[11px] font-semibold leading-tight truncate max-w-[64px]">
                  {w.full_name.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

export default AdminWorkerBar;
