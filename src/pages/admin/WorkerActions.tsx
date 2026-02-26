import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { ArrowRight, Calculator, Truck, Banknote, Wallet, MapPin, ShoppingCart, Activity, Shield, User } from 'lucide-react';
import { Worker } from '@/types/database';

const workerActions = [
  { key: 'accounting', icon: Calculator, path: '/accounting', labelKey: 'accounting.title', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { key: 'load_stock', icon: Truck, path: '/load-stock', labelKey: 'stock.load_to_worker', color: 'bg-green-50 border-green-200 text-green-700' },
  { key: 'worker_debts', icon: Banknote, path: '/worker-debts', labelKey: 'nav.worker_debts', color: 'bg-rose-50 border-rose-200 text-rose-700' },
  { key: 'expenses', icon: Wallet, path: '/expenses-management', labelKey: 'expenses.title', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { key: 'tracking', icon: MapPin, path: '/worker-tracking', labelKey: 'navigation.worker_tracking', color: 'bg-teal-50 border-teal-200 text-teal-700' },
  { key: 'orders', icon: ShoppingCart, path: '/orders', labelKey: 'nav.orders', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'activity', icon: Activity, path: '/activity-logs', labelKey: 'nav.activity_logs', color: 'bg-violet-50 border-violet-200 text-violet-700' },
  { key: 'permissions', icon: Shield, path: '/permissions', labelKey: 'nav.permissions', color: 'bg-slate-50 border-slate-200 text-slate-700' },
];

const WorkerActions: React.FC = () => {
  const { activeBranch } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { setSelectedWorker: setContextWorker } = useSelectedWorker();
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const { data: workers = [] } = useQuery({
    queryKey: ['workers-for-actions', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('*').eq('is_active', true).order('full_name');
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return (data || []) as Worker[];
    },
  });

  const handleSelectWorker = (worker: Worker) => {
    setSelectedWorker(worker);
    setContextWorker(worker.id, worker.full_name);
  };

  const handleBack = () => {
    setSelectedWorker(null);
    setContextWorker(null);
  };

  const handleAction = (action: typeof workerActions[0]) => {
    if (!selectedWorker) return;
    navigate(action.path);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        {selectedWorker && (
          <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-muted">
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-xl font-bold">
          {selectedWorker ? selectedWorker.full_name : t('worker_actions.title')}
        </h2>
      </div>

      {!selectedWorker ? (
        <div className="grid grid-cols-3 gap-3">
          {workers.map((worker) => (
            <div
              key={worker.id}
              className="flex flex-col items-center justify-center p-4 gap-2 rounded-xl border border-border bg-card cursor-pointer active:scale-95 transition-all hover:shadow-md"
              onClick={() => handleSelectWorker(worker)}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xs font-medium text-center leading-tight">{worker.full_name}</span>
              <span className="text-[10px] text-muted-foreground">{worker.role === 'worker' ? t('nav.workers') : worker.role}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {workerActions.map((action) => (
            <div
              key={action.key}
              className={`flex flex-col items-center justify-center p-4 gap-2 rounded-xl border cursor-pointer active:scale-95 transition-all hover:shadow-md ${action.color}`}
              onClick={() => handleAction(action)}
            >
              <action.icon className="w-7 h-7" />
              <span className="text-xs font-medium text-center leading-tight">{t(action.labelKey)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkerActions;
