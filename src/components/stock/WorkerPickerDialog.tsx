import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import { Search, User, AlertTriangle, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface WorkerOption {
  id: string;
  full_name: string;
  username: string;
}

interface WorkerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workers: WorkerOption[];
  selectedWorkerId: string;
  onSelect: (workerId: string) => void;
  stockAlerts?: { worker_id: string; deficit: number }[];
}

const WorkerPickerDialog: React.FC<WorkerPickerDialogProps> = ({
  open,
  onOpenChange,
  workers,
  selectedWorkerId,
  onSelect,
  stockAlerts = [],
}) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const filtered = workers.filter(w =>
    w.full_name.toLowerCase().includes(search.toLowerCase()) ||
    w.username.toLowerCase().includes(search.toLowerCase())
  );

  const getWorkerDeficit = (workerId: string) => {
    return stockAlerts
      .filter(a => a.worker_id === workerId)
      .reduce((sum, a) => sum + a.deficit, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            {t('stock.select_worker')}
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filtered.map(w => {
            const deficit = getWorkerDeficit(w.id);
            const isSelected = w.id === selectedWorkerId;
            return (
              <button
                key={w.id}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors
                  ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}
                `}
                onClick={() => {
                  onSelect(w.id);
                  onOpenChange(false);
                  setSearch('');
                }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                  <User className={`w-5 h-5 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
                </div>
                <div className="font-semibold text-xs leading-tight truncate w-full">{w.full_name}</div>
                {deficit > 0 ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    <AlertTriangle className="w-3 h-3 me-0.5" />
                    {deficit}
                  </Badge>
                ) : (
                  <CheckCircle className={`w-4 h-4 ${isSelected ? 'text-primary-foreground' : 'text-green-600'}`} />
                )}
              </button>
            );
          })}
          </div>
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              {t('common.no_results')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerPickerDialog;
