import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ManagerSalesSummaryContent } from '@/components/accounting/ManagerSalesSummaryDialog';

const ManagerSalesSummaryPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeBranch } = useAuth();

  const { data: activeWorkers = [] } = useQuery({
    queryKey: ['manager-sales-page-workers', activeBranch?.id],
    queryFn: async () => {
      let rolesQuery = supabase
        .from('worker_roles')
        .select('worker_id, custom_roles!inner(code)')
        .eq('custom_roles.code', 'delivery_rep');

      if (activeBranch?.id) {
        rolesQuery = rolesQuery.eq('branch_id', activeBranch.id);
      }

      const { data: workerRoles } = await rolesQuery;
      if (!workerRoles || workerRoles.length === 0) return [];

      const workerIds = [...new Set(workerRoles.map((wr) => wr.worker_id))];
      const { data } = await supabase
        .from('workers')
        .select('id, full_name, username')
        .in('id', workerIds)
        .eq('is_active', true)
        .order('full_name');

      return data || [];
    },
  });

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] min-h-0 flex-col p-2 sm:p-4" dir="rtl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 sm:text-lg">تجميع مبيعات العمال</h1>
            <p className="text-xs text-slate-500">{activeBranch?.name || 'جميع الفروع'}</p>
          </div>
        </div>
        <Button variant="outline" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowRight className="ms-1 h-4 w-4" />
          رجوع
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <ManagerSalesSummaryContent branchId={activeBranch?.id} workers={activeWorkers} />
      </div>
    </div>
  );
};

export default ManagerSalesSummaryPage;
