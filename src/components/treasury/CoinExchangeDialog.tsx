import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCoinExchangeTasks, useCoinExchangeReturns, useCreateCoinExchange, useReceiveBills, CoinExchangeTask } from '@/hooks/useCoinExchange';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Coins, ArrowLeft, CheckCircle, Clock, Plus, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { Worker } from '@/types/database';

interface CoinExchangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedWorkerId?: string;
}

const CoinExchangeDialog = ({ open, onOpenChange, preselectedWorkerId }: CoinExchangeDialogProps) => {
  const { t, dir } = useLanguage();
  const { activeBranch } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'details'>('list');
  const [selectedTask, setSelectedTask] = useState<CoinExchangeTask | null>(null);
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [returnNotes, setReturnNotes] = useState('');

  // Sync preselectedWorkerId when dialog opens
  useEffect(() => {
    if (open && preselectedWorkerId) {
      setWorkerId(preselectedWorkerId);
      setView('list'); // Show list first so user can see active tasks & receive bills
    } else if (open && !preselectedWorkerId) {
      setView('list');
    }
  }, [open, preselectedWorkerId]);

  const { data: workers = [] } = useQuery({
    queryKey: ['workers-coin-exchange', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('workers').select('*').eq('is_active', true).order('full_name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data } = await q;
      return (data || []) as Worker[];
    },
    enabled: open,
  });

  const { data: tasks = [] } = useCoinExchangeTasks();
  const { data: returns = [] } = useCoinExchangeReturns(selectedTask?.id || null);
  const createExchange = useCreateCoinExchange();
  const receiveBills = useReceiveBills();

  // Fetch available coins in treasury
  const { data: availableCoins = 0 } = useQuery({
    queryKey: ['treasury-available-coins', activeBranch?.id],
    queryFn: async () => {
      // Total coins from accounting sessions
      let coinQuery = supabase
        .from('accounting_session_items')
        .select('actual_amount, session_id, accounting_sessions!inner(branch_id)')
        .eq('item_type', 'coin_amount');
      if (activeBranch?.id) coinQuery = coinQuery.eq('accounting_sessions.branch_id', activeBranch.id);
      const { data: coinItems } = await coinQuery;
      const totalCoins = (coinItems || []).reduce((s: number, item: any) => s + Number(item.actual_amount || 0), 0);

      // Coins already assigned (active tasks)
      let taskQuery = supabase
        .from('coin_exchange_tasks')
        .select('coin_amount, returned_amount')
        .eq('status', 'active');
      if (activeBranch?.id) taskQuery = taskQuery.eq('branch_id', activeBranch.id);
      const { data: activeTasks } = await taskQuery;
      const assignedCoins = (activeTasks || []).reduce((s: number, t: any) => s + Number(t.coin_amount || 0) - Number(t.returned_amount || 0), 0);

      return totalCoins - assignedCoins;
    },
    enabled: open,
  });

  const filteredTasks = preselectedWorkerId ? tasks.filter(t => t.worker_id === preselectedWorkerId) : tasks;
  const activeTasks = filteredTasks.filter(t => t.status === 'active');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');

  const handleCreate = async () => {
    if (!workerId || !amount || Number(amount) <= 0) {
      toast.error(t('coin_exchange.enter_valid_data'));
      return;
    }
    try {
      await createExchange.mutateAsync({ worker_id: workerId, coin_amount: Number(amount), notes: notes || undefined });
      toast.success(t('coin_exchange.created_success'));
      setView('list');
      setWorkerId(preselectedWorkerId || '');
      setAmount('');
      setNotes('');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReceive = async () => {
    if (!selectedTask || !returnAmount || Number(returnAmount) <= 0) {
      toast.error(t('coin_exchange.enter_valid_amount'));
      return;
    }
    const amt = Number(returnAmount);
    if (amt > selectedTask.remaining_amount) {
      toast.error(t('coin_exchange.exceeds_remaining'));
      return;
    }
    try {
      await receiveBills.mutateAsync({
        task_id: selectedTask.id,
        amount: amt,
        notes: returnNotes || undefined,
        current_returned: selectedTask.returned_amount,
        total_amount: selectedTask.coin_amount,
      });
      toast.success(t('coin_exchange.received_success'));
      setReturnAmount('');
      setReturnNotes('');
      // Refresh selected task
      setSelectedTask(prev => prev ? { ...prev, returned_amount: prev.returned_amount + amt, remaining_amount: prev.remaining_amount - amt, status: (prev.returned_amount + amt >= prev.coin_amount) ? 'completed' : 'active' } : null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const resetAndClose = () => {
    setView('list');
    setSelectedTask(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent dir={dir} className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view !== 'list' && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setView('list'); setSelectedTask(null); }}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <Coins className="w-5 h-5" />
            {view === 'create' ? t('coin_exchange.new_task') : view === 'details' ? t('coin_exchange.task_details') : t('coin_exchange.title')}
          </DialogTitle>
        </DialogHeader>

        {view === 'list' && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => setView('create')}>
              <Plus className="w-4 h-4 ml-2" />
              {t('coin_exchange.assign_coins')}
            </Button>

            {activeTasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{t('coin_exchange.active_tasks')}</h3>
                {activeTasks.map(task => (
                  <div
                    key={task.id}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { setSelectedTask(task); setView('details'); }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{task.worker?.full_name}</span>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 ml-1" />
                        {t('coin_exchange.pending')}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                      <span>{t('coin_exchange.coin_amount')}: {task.coin_amount.toLocaleString()}</span>
                      <span>{t('coin_exchange.remaining')}: {task.remaining_amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{t('coin_exchange.completed_tasks')}</h3>
                {completedTasks.slice(0, 5).map(task => (
                  <div
                    key={task.id}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 opacity-70"
                    onClick={() => { setSelectedTask(task); setView('details'); }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{task.worker?.full_name}</span>
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle className="w-3 h-3 ml-1" />
                        {t('coin_exchange.completed')}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{task.coin_amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {filteredTasks.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">{t('coin_exchange.no_tasks')}</p>
            )}
          </div>
        )}

        {view === 'create' && (
          <div className="space-y-4">
            {preselectedWorkerId ? (
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-sm font-medium">{workers.find(w => w.id === preselectedWorkerId)?.full_name}</p>
              </div>
            ) : (
              <div>
                <Label>{t('coin_exchange.select_worker')}</Label>
                <Select value={workerId} onValueChange={setWorkerId}>
                  <SelectTrigger><SelectValue placeholder={t('coin_exchange.select_worker')} /></SelectTrigger>
                  <SelectContent>
                    {workers.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t('coin_exchange.coin_amount')}</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              <div className="flex items-center justify-between mt-1.5 text-xs">
                <span className="text-muted-foreground">
                  {t('coin_exchange.available_in_treasury')}: <span className={`font-bold ${(availableCoins - Number(amount || 0)) < 0 ? 'text-destructive' : 'text-green-600'}`}>{availableCoins.toLocaleString('ar-DZ')} د.ج</span>
                </span>
                {Number(amount) > 0 && (
                  <span className="text-muted-foreground">
                    {t('coin_exchange.after_assign')}: <span className={`font-bold ${(availableCoins - Number(amount)) < 0 ? 'text-destructive' : ''}`}>{(availableCoins - Number(amount)).toLocaleString('ar-DZ')} د.ج</span>
                  </span>
                )}
              </div>
            </div>
            <div>
              <Label>{t('common.notes')}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={createExchange.isPending}>
              {t('coin_exchange.confirm_assign')}
            </Button>
          </div>
        )}

        {view === 'details' && selectedTask && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg text-center">
                <Coins className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">{t('coin_exchange.coin_amount')}</p>
                <p className="font-bold">{selectedTask.coin_amount.toLocaleString()}</p>
              </div>
              <div className="p-3 border rounded-lg text-center">
                <Banknote className="w-5 h-5 mx-auto mb-1 text-green-500" />
                <p className="text-xs text-muted-foreground">{t('coin_exchange.returned')}</p>
                <p className="font-bold">{selectedTask.returned_amount.toLocaleString()}</p>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">{t('coin_exchange.remaining')}</p>
              <p className="text-xl font-bold text-primary">{selectedTask.remaining_amount.toLocaleString()}</p>
            </div>

            {selectedTask.status === 'active' && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-sm font-semibold">{t('coin_exchange.receive_bills')}</h4>
                <Input
                  type="number"
                  value={returnAmount}
                  onChange={e => setReturnAmount(e.target.value)}
                  placeholder={t('coin_exchange.bill_amount')}
                />
                <Textarea
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  placeholder={t('common.notes')}
                  rows={2}
                />
                <Button className="w-full" onClick={handleReceive} disabled={receiveBills.isPending}>
                  <Banknote className="w-4 h-4 ml-2" />
                  {t('coin_exchange.confirm_receive')}
                </Button>
              </div>
            )}

            {returns.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-sm font-semibold">{t('coin_exchange.return_history')}</h4>
                {returns.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                    <span className="text-green-600 font-medium">+{r.amount.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('ar-DZ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CoinExchangeDialog;
