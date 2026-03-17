import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClipboardList, User, Clock, Package, CreditCard, Users, ChevronLeft, FileEdit, UserPlus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { isAdminRole } from '@/lib/utils';

interface WorkerRequestSummary {
  workerId: string;
  workerName: string;
  customerRequests: number;
  expenseRequests: number;
  debtCollections: number;
  total: number;
}

const WorkerRequestsPopover: React.FC = () => {
  const { t } = useLanguage();
  const { role, activeBranch } = useAuth();
  const navigate = useNavigate();
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const isAdmin = isAdminRole(role);

  const { data: workerSummaries } = useQuery({
    queryKey: ['worker-request-summaries', activeBranch?.id],
    queryFn: async (): Promise<WorkerRequestSummary[]> => {
      const workerMap: Record<string, WorkerRequestSummary> = {};

      // 1. Customer approval requests
      let custQuery = supabase
        .from('customer_approval_requests')
        .select('requested_by, workers!customer_approval_requests_requested_by_fkey(id, full_name)')
        .eq('status', 'pending');
      if (role === 'branch_admin' && activeBranch) {
        custQuery = custQuery.eq('branch_id', activeBranch.id);
      }
      const { data: custReqs } = await custQuery;
      for (const r of (custReqs || [])) {
        const w = (r as any).workers;
        if (!w) continue;
        if (!workerMap[w.id]) {
          workerMap[w.id] = { workerId: w.id, workerName: w.full_name, customerRequests: 0, expenseRequests: 0, debtCollections: 0, total: 0 };
        }
        workerMap[w.id].customerRequests++;
        workerMap[w.id].total++;
      }

      // 2. Pending expenses
      let expQuery = supabase
        .from('expenses')
        .select('worker_id, worker:workers!expenses_worker_id_fkey(id, full_name)')
        .eq('status', 'pending');
      if (activeBranch) {
        expQuery = expQuery.eq('branch_id', activeBranch.id);
      }
      const { data: expReqs } = await expQuery;
      for (const r of (expReqs || [])) {
        const w = (r as any).worker;
        if (!w) continue;
        if (!workerMap[w.id]) {
          workerMap[w.id] = { workerId: w.id, workerName: w.full_name, customerRequests: 0, expenseRequests: 0, debtCollections: 0, total: 0 };
        }
        workerMap[w.id].expenseRequests++;
        workerMap[w.id].total++;
      }

      // 3. Pending debt collections
      const { data: debtReqs } = await supabase
        .from('debt_collections')
        .select('worker_id, worker:workers!debt_collections_worker_id_fkey(id, full_name)')
        .eq('status', 'pending');
      for (const r of (debtReqs || [])) {
        const w = (r as any).worker;
        if (!w) continue;
        if (!workerMap[w.id]) {
          workerMap[w.id] = { workerId: w.id, workerName: w.full_name, customerRequests: 0, expenseRequests: 0, debtCollections: 0, total: 0 };
        }
        workerMap[w.id].debtCollections++;
        workerMap[w.id].total++;
      }

      return Object.values(workerMap).sort((a, b) => b.total - a.total);
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const { data: workerDetails } = useQuery({
    queryKey: ['worker-request-details', selectedWorker],
    queryFn: async () => {
      if (!selectedWorker) return null;

      const [custRes, expRes, debtRes] = await Promise.all([
        supabase
          .from('customer_approval_requests')
          .select('id, operation_type, payload, created_at')
          .eq('requested_by', selectedWorker)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, amount, description, expense_date, category:expense_categories(name)')
          .eq('worker_id', selectedWorker)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('debt_collections')
          .select('id, amount_collected, collection_date, debt:customer_debts(customer:customers(name))')
          .eq('worker_id', selectedWorker)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      return {
        customers: custRes.data || [],
        expenses: expRes.data || [],
        debts: debtRes.data || [],
      };
    },
    enabled: !!selectedWorker,
  });

  if (!isAdmin) return null;

  const totalCount = workerSummaries?.reduce((s, w) => s + w.total, 0) || 0;

  const navigateToAction = (type: 'customers' | 'expenses' | 'debts') => {
    setIsOpen(false);
    setSelectedWorker(null);
    switch (type) {
      case 'customers':
        navigate('/customers');
        // Small delay to let page load, then switch to requests tab
        setTimeout(() => {
          const tabTrigger = document.querySelector('[value="requests"]') as HTMLElement;
          tabTrigger?.click();
        }, 300);
        break;
      case 'expenses':
        navigate('/expenses-management');
        break;
      case 'debts':
        navigate('/customer-debts');
        break;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setSelectedWorker(null); }}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
          title="طلبات العمال"
        >
          <ClipboardList className="w-4 h-4 text-orange-500" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-[70vh] flex flex-col">
        <div className="p-3 border-b bg-muted/30">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-orange-500" />
            طلبات العمال
            {totalCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5">{totalCount}</Badge>
            )}
          </h3>
        </div>

        <ScrollArea className="flex-1 max-h-[55vh]">
          {!workerSummaries || workerSummaries.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              لا توجد طلبات معلقة
            </div>
          ) : !selectedWorker ? (
            // Worker list view
            <div className="p-2 space-y-1">
              {workerSummaries.map(worker => (
                <button
                  key={worker.workerId}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-start"
                  onClick={() => setSelectedWorker(worker.workerId)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{worker.workerName}</p>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      {worker.customerRequests > 0 && (
                        <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                          <Users className="w-2.5 h-2.5" />{worker.customerRequests} عملاء
                        </span>
                      )}
                      {worker.expenseRequests > 0 && (
                        <span className="text-[10px] text-blue-600 flex items-center gap-0.5">
                          <CreditCard className="w-2.5 h-2.5" />{worker.expenseRequests} مصاريف
                        </span>
                      )}
                      {worker.debtCollections > 0 && (
                        <span className="text-[10px] text-orange-600 flex items-center gap-0.5">
                          <Package className="w-2.5 h-2.5" />{worker.debtCollections} تحصيل
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{worker.total}</Badge>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            // Worker details view
            <div className="p-2">
              <button
                className="flex items-center gap-2 text-xs text-primary mb-2 px-2"
                onClick={() => setSelectedWorker(null)}
              >
                <ChevronLeft className="w-3 h-3 rotate-180" />
                العودة لقائمة العمال
              </button>
              <Tabs defaultValue="customers" className="w-full">
                <TabsList className="w-full grid grid-cols-3 h-8">
                  <TabsTrigger value="customers" className="text-[10px] px-1">
                    عملاء ({workerDetails?.customers.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="expenses" className="text-[10px] px-1">
                    مصاريف ({workerDetails?.expenses.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="debts" className="text-[10px] px-1">
                    تحصيل ({workerDetails?.debts.length || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="customers" className="mt-2 space-y-1.5">
                  {(workerDetails?.customers || []).map((req: any) => (
                    <button
                      key={req.id}
                      className="w-full border rounded-lg p-2.5 text-xs space-y-1 text-start hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigateToAction('customers')}
                    >
                      <div className="flex items-center gap-1.5">
                        {req.operation_type === 'insert' ? (
                          <UserPlus className="w-3 h-3 text-green-600" />
                        ) : req.operation_type === 'update' ? (
                          <FileEdit className="w-3 h-3 text-blue-600" />
                        ) : (
                          <Trash2 className="w-3 h-3 text-destructive" />
                        )}
                        <span className="font-medium">{req.payload?.name || '-'}</span>
                        <Badge variant="outline" className="text-[9px] ms-auto">
                          {req.operation_type === 'insert' ? 'إضافة' : req.operation_type === 'update' ? 'تعديل' : 'حذف'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(req.created_at).toLocaleDateString('ar-DZ')}
                      </p>
                    </button>
                  ))}
                  {(!workerDetails?.customers || workerDetails.customers.length === 0) && (
                    <p className="text-center text-muted-foreground py-3 text-xs">لا توجد طلبات</p>
                  )}
                </TabsContent>

                <TabsContent value="expenses" className="mt-2 space-y-1.5">
                  {(workerDetails?.expenses || []).map((exp: any) => (
                    <button
                      key={exp.id}
                      className="w-full border rounded-lg p-2.5 text-xs space-y-1 text-start hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigateToAction('expenses')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{(exp as any).category?.name || 'مصروف'}</span>
                        <span className="font-bold text-primary">{Number(exp.amount).toLocaleString()} DA</span>
                      </div>
                      {exp.description && <p className="text-muted-foreground">{exp.description}</p>}
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />{exp.expense_date}
                      </p>
                    </button>
                  ))}
                  {(!workerDetails?.expenses || workerDetails.expenses.length === 0) && (
                    <p className="text-center text-muted-foreground py-3 text-xs">لا توجد طلبات</p>
                  )}
                </TabsContent>

                <TabsContent value="debts" className="mt-2 space-y-1.5">
                  {(workerDetails?.debts || []).map((d: any) => (
                    <button
                      key={d.id}
                      className="w-full border rounded-lg p-2.5 text-xs space-y-1 text-start hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigateToAction('debts')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{(d as any).debt?.customer?.name || '-'}</span>
                        <span className="font-bold text-orange-600">{Number(d.amount_collected).toLocaleString()} DA</span>
                      </div>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />{d.collection_date}
                      </p>
                    </button>
                  ))}
                  {(!workerDetails?.debts || workerDetails.debts.length === 0) && (
                    <p className="text-center text-muted-foreground py-3 text-xs">لا توجد طلبات</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default WorkerRequestsPopover;
