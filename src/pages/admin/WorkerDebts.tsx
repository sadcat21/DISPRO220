import React, { useState } from 'react';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Banknote, User, Calendar, Plus, CreditCard, ArrowDownCircle, Link2, CheckCheck } from 'lucide-react';
import WorkerPickerDialog from '@/components/stock/WorkerPickerDialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkerDebts, useCreateWorkerDebt, usePayWorkerDebt, useWorkerDebtPayments, WorkerDebt } from '@/hooks/useWorkerDebts';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

const WorkerDebtsPage: React.FC = () => {
  const { t, dir } = useLanguage();
  const { activeBranch } = useAuth();
  const { workerId: contextWorkerId, workerName: contextWorkerName } = useSelectedWorker();
  const { data: debts, isLoading } = useWorkerDebts(contextWorkerId || undefined);
  const createDebt = useCreateWorkerDebt();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<WorkerDebt | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [payDebt, setPayDebt] = useState<WorkerDebt | null>(null);
  const [showPayAll, setShowPayAll] = useState(false);

  // Add form
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [addWorkerId, setAddWorkerId] = useState(contextWorkerId || '');
  const [addAmount, setAddAmount] = useState('');
  const [addType, setAddType] = useState<'advance' | 'deficit'>('advance');
  const [addDesc, setAddDesc] = useState('');
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);

  // Pay form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [payAllMethod, setPayAllMethod] = useState('deduction');
  const [payAllNotes, setPayAllNotes] = useState('');

  const payMutation = usePayWorkerDebt();

  const fetchWorkers = async () => {
    setLoadingWorkers(true);
    let query = supabase.from('workers_safe').select('id, full_name').eq('is_active', true);
    if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
    const { data } = await query;
    setWorkers((data || []).map(w => ({ id: w.id!, full_name: w.full_name! })));
    setLoadingWorkers(false);
  };

  const handleOpenAdd = () => {
    fetchWorkers();
    setAddWorkerId('');
    setAddAmount('');
    setAddType('advance');
    setAddDesc('');
    setShowAdd(true);
  };

  const handleSaveDebt = async () => {
    if (!addWorkerId || !addAmount || Number(addAmount) <= 0) return;
    try {
      await createDebt.mutateAsync({
        worker_id: addWorkerId,
        amount: Number(addAmount),
        debt_type: addType,
        description: addDesc || undefined,
      });
      toast.success(t('worker_debts.added_success'));
      setShowAdd(false);
    } catch {
      toast.error(t('worker_debts.add_error'));
    }
  };

  const handlePay = async () => {
    if (!payDebt || !payAmount || Number(payAmount) <= 0) return;
    const roundedAmount = Math.ceil(Number(payAmount));
    try {
      await payMutation.mutateAsync({
        worker_debt_id: payDebt.id,
        amount: roundedAmount,
        payment_method: payMethod,
        notes: payNotes || undefined,
        current_paid: Number(payDebt.paid_amount),
        total_amount: Number(payDebt.amount),
      });
      toast.success(t('worker_debts.pay_success'));
      setShowPay(false);
      setPayDebt(null);
    } catch {
      toast.error(t('worker_debts.pay_error'));
    }
  };

  const handlePayAll = async () => {
    const activeDebts = debts?.filter(d => d.status !== 'paid' && Number(d.remaining_amount) > 0) || [];
    if (activeDebts.length === 0) { toast.info(t('worker_debts.no_active')); return; }
    try {
      for (const debt of activeDebts) {
        const remaining = Math.ceil(Number(debt.remaining_amount));
        if (remaining <= 0) continue;
        await payMutation.mutateAsync({
          worker_debt_id: debt.id,
          amount: remaining,
          payment_method: payAllMethod,
          notes: payAllNotes || t('worker_debts.bulk_note'),
          current_paid: Number(debt.paid_amount),
          total_amount: Number(debt.amount),
        });
      }
      toast.success(`${t('worker_debts.bulk_pay_success')} (${activeDebts.length})`);
      setShowPayAll(false);
    } catch {
      toast.error(t('worker_debts.bulk_pay_error'));
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'partially_paid': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return '';
    }
  };

  const typeLabel = (type: string) => type === 'advance' ? t('worker_debts.advance') : t('worker_debts.accounting_deficit');

  const totalRemaining = debts?.reduce((sum, d) => sum + Number(d.remaining_amount), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" dir={dir}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Banknote className="w-5 h-5 text-primary" />
            {t('worker_debts.title')}
          </h2>
          {contextWorkerName && <p className="text-sm text-muted-foreground">{contextWorkerName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleOpenAdd}>
            <Plus className="w-4 h-4 ml-1" />
            {t('worker_debts.add')}
          </Button>
          {totalRemaining > 0 && (
            <Button size="sm" variant="outline" onClick={() => { setPayAllMethod('deduction'); setPayAllNotes(''); setShowPayAll(true); }}>
              <CheckCheck className="w-4 h-4 ml-1" />
              {t('worker_debts.pay_all')}
            </Button>
          )}
        </div>
      </div>

      {/* Total */}
      {totalRemaining > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">{t('worker_debts.total_remaining')}</span>
            <span className="text-lg font-bold text-destructive">{totalRemaining.toLocaleString()} DA</span>
          </CardContent>
        </Card>
      )}

      {/* Debts List */}
      {!debts || debts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Banknote className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('worker_debts.no_debts')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {debts.map(debt => (
            <Card key={debt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedDebt(debt)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-bold text-sm">{debt.worker?.full_name}</span>
                  </div>
                  <Badge className={statusColor(debt.status)}>
                    {debt.status === 'active' ? t('worker_debts.active') : debt.status === 'partially_paid' ? t('worker_debts.partially_paid') : t('worker_debts.paid')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">{typeLabel(debt.debt_type)}</Badge>
                    {debt.session_id && <Link2 className="w-3 h-3 text-primary" />}
                  </span>
                  <span className="font-bold text-destructive">{Number(debt.remaining_amount).toLocaleString()} DA</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(debt.created_at), 'dd/MM/yyyy')}
                  {debt.description && <span>• {debt.description}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Debt Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t('worker_debts.add_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('worker_debts.worker')}</Label>
              {loadingWorkers ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start h-10 mt-1"
                    onClick={() => setWorkerPickerOpen(true)}
                  >
                    {addWorkerId ? (
                      <span className="flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        {workers.find(w => w.id === addWorkerId)?.full_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('worker_debts.select_worker')}</span>
                    )}
                  </Button>
                  <WorkerPickerDialog
                    open={workerPickerOpen}
                    onOpenChange={setWorkerPickerOpen}
                    workers={workers.map(w => ({ id: w.id, full_name: w.full_name, username: '' }))}
                    selectedWorkerId={addWorkerId}
                    onSelect={setAddWorkerId}
                  />
                </>
              )}
            </div>
            <div>
              <Label>{t('worker_debts.type')}</Label>
              <Select value={addType} onValueChange={(v: 'advance' | 'deficit') => setAddType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">{t('worker_debts.advance_salary')}</SelectItem>
                  <SelectItem value="deficit">{t('worker_debts.accounting_deficit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('worker_debts.amount')}</Label>
              <Input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>{t('worker_debts.notes')}</Label>
              <Input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder={t('worker_debts.optional_desc')} />
            </div>
            <Button className="w-full" onClick={handleSaveDebt} disabled={createDebt.isPending}>
              {createDebt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Debt Details Dialog */}
      {selectedDebt && (
        <DebtDetailDialog
          debt={selectedDebt}
          open={!!selectedDebt}
          onOpenChange={(o) => !o && setSelectedDebt(null)}
          onPay={(d) => {
            setPayDebt(d);
            setPayAmount(String(Math.ceil(Number(d.remaining_amount))));
            setPayMethod('deduction');
            setPayNotes('');
            setShowPay(true);
          }}
        />
      )}

      {/* Pay Dialog */}
      <Dialog open={showPay} onOpenChange={setShowPay}>
        <DialogContent className="max-w-sm" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t('worker_debts.pay_title')}</DialogTitle>
          </DialogHeader>
          {payDebt && (
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t('worker_debts.remaining_label')}</p>
                <p className="text-2xl font-bold text-destructive">{Number(payDebt.remaining_amount).toLocaleString()} DA</p>
              </div>
              <div>
                <Label>{t('worker_debts.amount_label')}</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} max={Number(payDebt.remaining_amount)} />
              </div>
              <div>
                <Label>{t('worker_debts.payment_method')}</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t('worker_debts.cash')}</SelectItem>
                    <SelectItem value="deduction">{t('worker_debts.deduction')}</SelectItem>
                    <SelectItem value="transfer">{t('worker_debts.transfer')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('worker_debts.notes')}</Label>
                <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handlePay} disabled={payMutation.isPending}>
                {payMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('worker_debts.confirm_pay')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pay All Dialog */}
      <Dialog open={showPayAll} onOpenChange={setShowPayAll}>
        <DialogContent className="max-w-sm" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t('worker_debts.pay_all_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{t('worker_debts.total_remaining_label')}</p>
              <p className="text-2xl font-bold text-destructive">{Math.ceil(totalRemaining).toLocaleString()} DA</p>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <p>{t('worker_debts.will_pay')} {debts?.filter(d => d.status !== 'paid' && Number(d.remaining_amount) > 0).length || 0} {t('worker_debts.active_debts_count')}</p>
            </div>
            <div>
              <Label>{t('worker_debts.payment_method')}</Label>
              <Select value={payAllMethod} onValueChange={setPayAllMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('worker_debts.cash')}</SelectItem>
                  <SelectItem value="deduction">{t('worker_debts.deduction')}</SelectItem>
                  <SelectItem value="transfer">{t('worker_debts.transfer')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('worker_debts.notes')}</Label>
              <Input value={payAllNotes} onChange={e => setPayAllNotes(e.target.value)} placeholder={t('worker_debts.optional_notes')} />
            </div>
            <Button className="w-full" variant="destructive" onClick={handlePayAll} disabled={payMutation.isPending}>
              {payMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCheck className="w-4 h-4 ml-1" />}
              {t('worker_debts.confirm_pay_all')} ({Math.ceil(totalRemaining).toLocaleString()} DA)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Sub-component for debt details
const DebtDetailDialog: React.FC<{
  debt: WorkerDebt;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPay: (d: WorkerDebt) => void;
}> = ({ debt, open, onOpenChange, onPay }) => {
  const { dir, t } = useLanguage();
  const { data: payments, isLoading } = useWorkerDebtPayments(debt.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle>{t('worker_debts.details_title')} - {debt.worker?.full_name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(85vh-6rem)] px-4 py-3">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">{t('worker_debts.amount_label')}</p>
                <p className="font-bold">{Number(debt.amount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t('worker_debts.paid_label')}</p>
                <p className="font-bold text-green-600">{Number(debt.paid_amount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t('worker_debts.remaining_label')}</p>
                <p className="font-bold text-destructive">{Number(debt.remaining_amount).toLocaleString()}</p>
              </div>
            </div>

            <div className="text-xs space-y-1 text-muted-foreground">
              <p>{t('worker_debts.type')}: <Badge variant="outline" className="text-xs">{debt.debt_type === 'advance' ? t('worker_debts.advance') : t('worker_debts.accounting_deficit')}</Badge></p>
              {debt.description && <p>{t('worker_debts.notes')}: {debt.description}</p>}
              <p>{format(new Date(debt.created_at), 'dd/MM/yyyy HH:mm')}</p>
            </div>

            {/* Payments */}
            <div className="border-t pt-2">
              <p className="text-sm font-medium mb-2">{t('worker_debts.payment_history')}</p>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : payments && payments.length > 0 ? (
                <div className="space-y-1">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs bg-muted/30 rounded p-2">
                      <div className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <span>{Number(p.amount).toLocaleString()} DA</span>
                        <span className="text-muted-foreground">({p.payment_method})</span>
                      </div>
                      <span className="text-muted-foreground">{format(new Date(p.created_at), 'dd/MM HH:mm')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center text-muted-foreground">{t('worker_debts.no_payments')}</p>
              )}
            </div>

            {debt.status !== 'paid' && (
              <Button className="w-full" onClick={() => onPay(debt)}>
                <ArrowDownCircle className="w-4 h-4 ml-1" />
                {t('worker_debts.pay_btn')}
              </Button>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerDebtsPage;
