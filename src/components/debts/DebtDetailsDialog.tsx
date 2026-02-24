import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Banknote, Calendar, Eye, Phone, MapPin } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDebtPayments } from '@/hooks/useDebtPayments';
import { CustomerDebtWithDetails } from '@/types/accounting';
import { format } from 'date-fns';
import CollectDebtDialog from './CollectDebtDialog';
import VisitNoPaymentDialog from './VisitNoPaymentDialog';
import DebtScheduleSection from './DebtScheduleSection';

interface DebtDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debts: CustomerDebtWithDetails[];
  customerName: string;
}

const DebtDetailsDialog: React.FC<DebtDetailsDialogProps> = ({
  open, onOpenChange, debts, customerName,
}) => {
  const { t, dir } = useLanguage();
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [collectDebt, setCollectDebt] = useState<CustomerDebtWithDetails | null>(null);
  const [visitDebt, setVisitDebt] = useState<CustomerDebtWithDetails | null>(null);
  const { data: payments, isLoading: paymentsLoading } = useDebtPayments(selectedDebtId);

  const totalRemaining = debts.reduce((sum, d) => sum + Number(d.remaining_amount), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'partially_paid': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return '';
    }
  };

  const handleCollect = (debt: CustomerDebtWithDetails) => {
    setCollectDebt(debt);
    setShowCollect(true);
  };

  const handleVisitNoPayment = (debt: CustomerDebtWithDetails) => {
    setVisitDebt(debt);
    setShowVisit(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle>{customerName}</DialogTitle>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">{t('debts.total_debts')}</span>
              <span className="text-lg font-bold text-destructive">{totalRemaining.toLocaleString()} DA</span>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-6rem)] px-4 py-3">
            <div className="space-y-3">
              {debts.map(debt => (
                <div
                  key={debt.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge className={statusColor(debt.status)}>
                      {t(`debts.${debt.status}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(debt.created_at), 'dd/MM/yyyy')}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">{t('debts.total_debts')}</p>
                      <p className="font-bold">{Number(debt.total_amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t('debts.paid_amount')}</p>
                      <p className="font-bold text-green-600">{Number(debt.paid_amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t('debts.remaining')}</p>
                      <p className="font-bold text-destructive">{Number(debt.remaining_amount).toLocaleString()}</p>
                    </div>
                  </div>

                  {debt.worker && (
                    <p className="text-xs text-muted-foreground">
                      {t('orders.created_by')}: {debt.worker.full_name}
                    </p>
                  )}

                  {/* Payment history toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setSelectedDebtId(selectedDebtId === debt.id ? null : debt.id)}
                  >
                    {selectedDebtId === debt.id ? '▲ إخفاء السجل' : '▼ سجل المدفوعات'}
                  </Button>

                  {selectedDebtId === debt.id && (
                    <div className="bg-muted/20 rounded-lg border border-border/50 overflow-hidden">
                      {/* Header */}
                      <div className="bg-muted/50 px-3 py-1.5 border-b border-border/50">
                        <span className="text-[11px] font-medium text-muted-foreground">سجل المدفوعات</span>
                      </div>
                      <div
                        className="max-h-52 overflow-y-auto p-1.5"
                        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain' }}
                        onTouchMove={e => e.stopPropagation()}
                      >
                          {paymentsLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto my-3" />
                          ) : payments && payments.length > 0 ? (
                            (() => {
                              const sorted = [...payments].sort((a, b) => 
                                new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()
                              );
                              const total = Number(debt.total_amount);
                              const paymentsSum = sorted.reduce((s, p) => s + Number(p.amount), 0);
                              const basePaid = Number(debt.paid_amount) - paymentsSum;
                              let cumPaid = basePaid;
                              const withBalances = sorted.map(p => {
                                cumPaid += Number(p.amount);
                                return { ...p, cumPaid, remaining: total - cumPaid };
                              });
                              withBalances.reverse();
                              
                              return withBalances.map((p) => {
                                const isVisit = Number(p.amount) === 0;
                                const isPhone = p.notes?.includes('اتصال هاتفي');
                                
                                return (
                                  <div
                                    key={p.id}
                                    className={`rounded-md p-2 mb-1.5 last:mb-0 text-xs ${
                                      isVisit
                                        ? 'bg-muted/40 border border-dashed border-border/60'
                                        : 'bg-background border border-border shadow-sm'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="flex items-center gap-1.5 font-medium">
                                        {isVisit ? (
                                          <>
                                            {isPhone ? (
                                              <Phone className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                            ) : (
                                              <MapPin className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
                                            )}
                                            <span className={isPhone ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}>
                                              {isPhone ? '📞 اتصال' : '🏪 محلي'}
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <Banknote className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-foreground">{Number(p.amount).toLocaleString()} DA</span>
                                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                                              {t(`debts.method_${p.payment_method}`)}
                                            </Badge>
                                          </>
                                        )}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {format(new Date(p.collected_at), 'dd/MM HH:mm')}
                                      </span>
                                    </div>

                                    {!isVisit && (
                                      <div className="flex items-center gap-3 text-[10px] mt-1 mr-5">
                                        <span className="text-primary">
                                          ✓ {t('debts.paid_amount')}: {p.cumPaid.toLocaleString()} DA
                                        </span>
                                        <span className="text-destructive">
                                          ← {t('debts.remaining')}: {Math.max(0, p.remaining).toLocaleString()} DA
                                        </span>
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between mt-0.5">
                                      {p.worker && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {t('debts.collector')}: {p.worker.full_name}
                                        </span>
                                      )}
                                      {p.notes && !isVisit && (
                                        <span className="text-[10px] text-muted-foreground truncate max-w-[50%]">{p.notes}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()
                          ) : (
                            <p className="text-xs text-center text-muted-foreground py-3">لا توجد مدفوعات</p>
                          )}
                      </div>
                    </div>
                  )}

                  {debt.status !== 'paid' && (
                    <>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleCollect(debt)}
                        >
                          <Banknote className="w-4 h-4 ml-1" />
                          {t('debts.collect')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleVisitNoPayment(debt)}
                          disabled={false}
                        >
                          <Eye className="w-4 h-4 ml-1" />
                          {t('debts.visit_no_payment')}
                        </Button>
                      </div>
                      <DebtScheduleSection debt={debt} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {collectDebt && (
        <CollectDebtDialog
          open={showCollect}
          onOpenChange={setShowCollect}
          debtId={collectDebt.id}
          totalDebtAmount={Number(collectDebt.total_amount)}
          paidAmountBefore={Number(collectDebt.paid_amount)}
          remainingAmount={Number(collectDebt.remaining_amount)}
          customerName={customerName}
          customerId={collectDebt.customer_id}
          defaultAmount={collectDebt.collection_amount || undefined}
          collectionType={collectDebt.collection_type}
          collectionDays={collectDebt.collection_days}
        />
      )}

      {visitDebt && (
        <VisitNoPaymentDialog
          open={showVisit}
          onOpenChange={setShowVisit}
          debtId={visitDebt.id}
          customerName={customerName}
          collectionType={visitDebt.collection_type}
          collectionDays={visitDebt.collection_days}
          customerLatitude={visitDebt.customer?.latitude}
          customerLongitude={visitDebt.customer?.longitude}
        />
      )}
    </>
  );
};

export default DebtDetailsDialog;
