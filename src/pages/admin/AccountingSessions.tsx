import React, { useState, useEffect } from 'react';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Calculator, User, Calendar, ClipboardList, TrendingUp, TrendingDown, Banknote, ArrowDownCircle, CreditCard, AlertTriangle, ChevronDown, Trash2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountingSessions, AccountingSession, AccountingSessionItem, useDeleteSession } from '@/hooks/useAccountingSessions';
import CreateSessionDialog from '@/components/accounting/CreateSessionDialog';
import SessionDetailsDialog from '@/components/accounting/SessionDetailsDialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';


const fmt = (n: number) => n.toLocaleString();

const getItemAmount = (items: AccountingSessionItem[] | undefined, type: string, field: 'expected_amount' | 'actual_amount' = 'actual_amount') => {
  if (!items) return 0;
  const item = items.find(i => i.item_type === type);
  return item ? Number(item[field]) : 0;
};

const AccountingSessions: React.FC = () => {
  const { t } = useLanguage();
  const { activeBranch, role } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const { workerId: contextWorkerId } = useSelectedWorker();
  const [preselectedWorkerId, setPreselectedWorkerId] = useState('');
  const [selectedSession, setSelectedSession] = useState<AccountingSession | null>(null);
  const [deleteSession2, setDeleteSession2] = useState<AccountingSession | null>(null);
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const isAdminOrBranchAdmin = role === 'admin' || role === 'branch_admin';

  const { data: sessions, isLoading } = useAccountingSessions({ status: statusFilter });
  const deleteSession = useDeleteSession();


  useEffect(() => {
    const fetchWorkers = async () => {
      setLoadingWorkers(true);
      let query = supabase.from('workers_safe').select('id, full_name').eq('is_active', true);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      setWorkers((data || []).map(w => ({ id: w.id!, full_name: w.full_name! })));
      setLoadingWorkers(false);
    };
    fetchWorkers();
  }, [activeBranch?.id]);

  // Auto-open create dialog if coming from WorkerActions
  useEffect(() => {
    if (contextWorkerId) {
      setPreselectedWorkerId(contextWorkerId);
      setShowCreate(true);
    }
  }, [contextWorkerId]);

  const handleWorkerClick = (workerId: string) => {
    setPreselectedWorkerId(workerId);
    setShowCreate(true);
  };

  const handleDeleteSession = async (session: AccountingSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteSession2(session);
  };

  const confirmDeleteSession = async () => {
    if (!deleteSession2) return;
    try {
      await deleteSession.mutateAsync(deleteSession2.id);
      toast.success('تم حذف الجلسة بنجاح');
      if (selectedSession?.id === deleteSession2.id) setSelectedSession(null);
    } catch (error: any) {
      toast.error('فشل في حذف الجلسة: ' + error.message);
    }
    setDeleteSession2(null);
  };


  const statusColor = (s: string) => {
    switch (s) {
      case 'open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'disputed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return '';
    }
  };

  if (isLoading && loadingWorkers) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold leading-tight">{t('accounting.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('accounting.select_worker')}</p>
        </div>
      </div>

      {/* Worker Buttons Grid */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('accounting.select_worker')}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {loadingWorkers ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {workers.map(worker => (
              <Button
                key={worker.id}
                variant="outline"
                className="h-auto py-3.5 px-4 flex items-center gap-3 justify-start rounded-xl border-2 hover:border-primary/40 hover:bg-primary/5 transition-all"
                onClick={() => handleWorkerClick(worker.id)}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-semibold text-wrap text-start">{worker.full_name}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Previous Sessions Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-px w-4 bg-border" />
            <span className="text-sm font-bold">{t('accounting.previous_sessions')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="open">{t('accounting.status_open')}</SelectItem>
              <SelectItem value="completed">{t('accounting.status_completed')}</SelectItem>
              <SelectItem value="disputed">{t('accounting.status_disputed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sessions List */}
        {!sessions || sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">{t('accounting.no_sessions')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {sessions.map(session => {
              const totalSales = getItemAmount(session.items, 'total_sales');
              const physicalCashExpected = getItemAmount(session.items, 'physical_cash', 'expected_amount');
              const physicalCashActual = getItemAmount(session.items, 'physical_cash', 'actual_amount');
              const newDebts = getItemAmount(session.items, 'new_debts');
              const debtCollections = getItemAmount(session.items, 'debt_collections_total');
              const expenses = getItemAmount(session.items, 'expenses');
              const cashDiff = physicalCashActual - physicalCashExpected;

              return (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99] rounded-xl border-2 hover:border-primary/20"
                  onClick={() => setSelectedSession(session)}
                >
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold text-sm">{session.worker?.full_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${statusColor(session.status)} text-[11px] px-2.5 py-0.5 rounded-full`}>
                          {t(`accounting.status_${session.status}`)}
                        </Badge>
                        {isAdminOrBranchAdmin && (
                          <button
                            onClick={(e) => handleDeleteSession(session, e)}
                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="حذف الجلسة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{format(new Date(session.session_date), 'dd/MM/yyyy')}</span>
                      <span className="text-muted-foreground/40">|</span>
                      <span>{format(new Date(session.period_start), 'dd/MM HH:mm')} → {format(new Date(session.period_end), 'dd/MM HH:mm')}</span>
                    </div>

                    {/* Collapsible Financial Summary */}
                    {session.items && session.items.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger
                          className="w-full flex items-center justify-center gap-1.5 pt-2.5 mt-2.5 border-t text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ChevronDown className="w-3.5 h-3.5 transition-transform [[data-state=open]>&]:rotate-180" />
                          <span className="font-medium">{t('accounting.financial_summary') || 'ملخص مالي'}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="grid grid-cols-3 gap-2 pt-2.5">
                            <MiniStat icon={<TrendingUp className="w-3 h-3" />} label={t('accounting.total_sales')} value={totalSales} />
                            <MiniStat icon={<Banknote className="w-3 h-3" />} label={t('accounting.physical_cash')} value={physicalCashActual} color="green" />
                            <MiniStat icon={<TrendingDown className="w-3 h-3" />} label={t('accounting.new_debts')} value={newDebts} color="red" />
                            <MiniStat icon={<ArrowDownCircle className="w-3 h-3" />} label={t('accounting.debt_collections')} value={debtCollections} color="orange" />
                            <MiniStat icon={<CreditCard className="w-3 h-3" />} label={t('accounting.expenses')} value={expenses} />
                            <div className={`rounded-lg p-2 text-center ${cashDiff >= 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-destructive/10'}`}>
                              <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {cashDiff >= 0 ? t('accounting.surplus') || 'فائض' : t('accounting.deficit') || 'عجز'}
                              </p>
                              <p className={`text-xs font-bold ${cashDiff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                {cashDiff >= 0 ? '+' : ''}{fmt(cashDiff)}
                              </p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {session.notes && (
                      <p className="text-xs text-muted-foreground mt-2 truncate bg-muted/30 rounded px-2 py-1">{session.notes}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateSessionDialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setPreselectedWorkerId('');
        }}
        preselectedWorkerId={preselectedWorkerId}
      />

      {selectedSession && (
        <SessionDetailsDialog
          open={!!selectedSession}
          onOpenChange={(open) => !open && setSelectedSession(null)}
          session={selectedSession}
        />
      )}

      {/* Confirm Delete Session */}
      <AlertDialog open={!!deleteSession2} onOpenChange={() => setDeleteSession2(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-destructive" />حذف جلسة المحاسبة</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف جلسة محاسبة "{deleteSession2?.worker?.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteSession}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Mini stat for session card
const MiniStat: React.FC<{ icon: React.ReactNode; label: string; value: number; color?: string }> = ({ icon, label, value, color }) => (
  <div className="rounded-lg bg-muted/50 p-2 text-center">
    <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5">
      {icon}
      {label}
    </p>
    <p className={`text-xs font-bold ${
      color === 'green' ? 'text-green-600' :
      color === 'red' ? 'text-destructive' :
      color === 'orange' ? 'text-orange-600' :
      ''
    }`}>
      {fmt(value)}
    </p>
  </div>
);

export default AccountingSessions;
