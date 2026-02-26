import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { useAllWorkersLiability, useWorkerLiability, useAddLiabilityAdjustment, WorkerLiabilitySummary } from '@/hooks/useWorkerLiability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, Wallet, TrendingUp, TrendingDown, Calculator, PenLine } from 'lucide-react';
import { toast } from 'sonner';

const WorkerLiability: React.FC = () => {
  const { t } = useLanguage();
  const { workerId: contextWorkerId, workerName: contextWorkerName } = useSelectedWorker();
  const { data: workers = [], isLoading } = useAllWorkersLiability();
  const [selectedWorker, setSelectedWorker] = useState<WorkerLiabilitySummary | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustWorker, setAdjustWorker] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const addAdjustment = useAddLiabilityAdjustment();

  // If a worker is pre-selected from WorkerActions context, auto-select them
  const { data: contextLiability } = useWorkerLiability(contextWorkerId && !selectedWorker ? contextWorkerId : null);

  useEffect(() => {
    if (contextWorkerId && contextLiability && !selectedWorker) {
      setSelectedWorker(contextLiability);
    }
  }, [contextWorkerId, contextLiability, selectedWorker]);

  // Also update selectedWorker when workers list loads and context is set
  useEffect(() => {
    if (contextWorkerId && workers.length > 0 && !selectedWorker) {
      const found = workers.find(w => w.workerId === contextWorkerId);
      if (found) setSelectedWorker(found);
    }
  }, [contextWorkerId, workers, selectedWorker]);

  const handleAdjust = async () => {
    if (!adjustWorker || !adjustAmount) return;
    try {
      await addAdjustment.mutateAsync({
        worker_id: adjustWorker,
        amount: Number(adjustAmount),
        adjustment_type: adjustType,
        reason: adjustReason,
      });
      toast.success(t('liability.adjustment_saved'));
      setAdjustDialogOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const formatCurrency = (n: number) => n.toLocaleString('ar-DZ') + ' د.ج';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        {selectedWorker && (
          <button onClick={() => setSelectedWorker(null)} className="p-1.5 rounded-lg hover:bg-muted">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <Wallet className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold">{t('liability.title')}</h2>
      </div>

      {!selectedWorker ? (
        <div className="space-y-3">
          {workers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">{t('common.no_data')}</p>
          )}
          {workers.map((w) => (
            <Card
              key={w.workerId}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedWorker(w)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{w.workerName}</p>
                  <p className="text-xs text-muted-foreground">{t('liability.total')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={w.totalLiability > 0 ? 'destructive' : w.totalLiability < 0 ? 'secondary' : 'outline'} className="text-sm px-3 py-1">
                    {formatCurrency(w.totalLiability)}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAdjustWorker(w.workerId);
                      setAdjustDialogOpen(true);
                    }}
                  >
                    <PenLine className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <WorkerLiabilityDetail
          summary={selectedWorker}
          formatCurrency={formatCurrency}
          onAdjust={() => {
            setAdjustWorker(selectedWorker.workerId);
            setAdjustDialogOpen(true);
          }}
        />
      )}

      {/* Manual Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('liability.manual_adjustment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={adjustType} onValueChange={(v) => setAdjustType(v as 'add' | 'subtract')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">{t('liability.add_amount')}</SelectItem>
                <SelectItem value="subtract">{t('liability.subtract_amount')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder={t('liability.amount')}
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
            />
            <Textarea
              placeholder={t('liability.reason')}
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
            <Button onClick={handleAdjust} disabled={!adjustAmount || addAdjustment.isPending} className="w-full">
              {addAdjustment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const WorkerLiabilityDetail: React.FC<{
  summary: WorkerLiabilitySummary;
  formatCurrency: (n: number) => string;
  onAdjust: () => void;
}> = ({ summary, formatCurrency, onAdjust }) => {
  const { t } = useLanguage();

  const rows = [
    { label: t('liability.delivered_cash'), value: summary.deliveredCash, icon: TrendingUp, color: 'text-green-600' },
    { label: t('liability.debt_collections'), value: summary.debtCollectionsCash, icon: TrendingUp, color: 'text-green-600' },
    { label: t('liability.expenses'), value: -summary.approvedExpenses, icon: TrendingDown, color: 'text-red-600' },
    { label: t('liability.accounted'), value: -summary.accountedAmount, icon: Calculator, color: 'text-blue-600' },
    { label: t('liability.manual_adj'), value: summary.manualAdjustment, icon: PenLine, color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            {summary.workerName}
            <Button size="sm" variant="outline" onClick={onAdjust}>
              <PenLine className="w-4 h-4 ml-1" />
              {t('liability.adjust')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <row.icon className={`w-4 h-4 ${row.color}`} />
                <span className="text-sm">{row.label}</span>
              </div>
              <span className={`font-semibold text-sm ${row.value >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {row.value >= 0 ? '+' : ''}{formatCurrency(row.value)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t-2 border-primary/30">
            <span className="font-bold">{t('liability.total')}</span>
            <Badge variant={summary.totalLiability > 0 ? 'destructive' : 'outline'} className="text-base px-4 py-1">
              {formatCurrency(summary.totalLiability)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerLiability;
