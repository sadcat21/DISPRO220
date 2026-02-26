import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTreasurySummary, useManagerTreasury, useManagerHandovers, useCreateHandover, useAddTreasuryEntry } from '@/hooks/useManagerTreasury';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PaymentMethodDetailsDialog from '@/components/treasury/PaymentMethodDetailsDialog';
import HandoverItemPickerDialog, { PickedItem } from '@/components/treasury/HandoverItemPickerDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Banknote, CreditCard, Receipt, ArrowUpRight, Plus, Send, Coins, TrendingUp, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import InvoiceOCRScanner from '@/components/treasury/InvoiceOCRScanner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

const paymentMethodLabels: Record<string, { ar: string; icon: any }> = {
  cash_invoice1: { ar: 'كاش فاتورة 1', icon: Banknote },
  cash_invoice2: { ar: 'كاش فاتورة 2', icon: Coins },
  check: { ar: 'شيك', icon: CreditCard },
  bank_receipt: { ar: 'فيرسمو', icon: Receipt },
  bank_transfer: { ar: 'فيرمو', icon: ArrowUpRight },
};

const itemTypeLabels: Record<string, string> = {
  total_sales: 'إجمالي المبيعات',
  total_paid: 'المبالغ المدفوعة',
  new_debts: 'ديون جديدة',
  invoice1_total: 'فاتورة 1 - الإجمالي',
  invoice1_check: 'فاتورة 1 - شيك',
  invoice1_transfer: 'فاتورة 1 - تحويل بنكي',
  invoice1_receipt: 'فاتورة 1 - تسبيق',
  invoice1_espace_cash: 'فاتورة 1 - كاش',
  invoice2_cash: 'فاتورة 2 - كاش',
  debt_collections_total: 'تحصيل ديون - الإجمالي',
  debt_collections_cash: 'تحصيل ديون - كاش',
  physical_cash: 'الكاش المادي المستلم',
  coin_amount: 'العملات المعدنية',
  expenses: 'المصاريف',
};

const TreasuryCard = ({ icon, label, total, handed, colorClass, borderClass, onClick }: {
  icon: React.ReactNode; label: string; total: number; handed: number; colorClass: string; borderClass: string; onClick: () => void;
}) => {
  const remaining = total - handed;
  return (
    <Card className={`${borderClass} cursor-pointer hover:shadow-md transition-shadow`} onClick={onClick}>
      <CardContent className="p-3 text-center space-y-1">
        <div className="mx-auto mb-1">{icon}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-bold text-${colorClass} truncate`}>{total.toLocaleString()} د.ج</p>
        <div className="flex justify-between text-[10px] px-1">
          <span className="text-green-600">مسلّم: {handed.toLocaleString()}</span>
          <span className="text-orange-600">متبقي: {remaining.toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const ManagerTreasury = () => {
  const { t } = useLanguage();
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: summaryLoading } = useTreasurySummary();
  const { data: entries } = useManagerTreasury();
  const { data: handovers } = useManagerHandovers();
  const createHandover = useCreateHandover();
  const addEntry = useAddTreasuryEntry();

  // Fetch session discrepancies
  const { data: discrepancies } = useQuery({
    queryKey: ['treasury-discrepancies', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('accounting_session_items')
        .select('item_type, expected_amount, actual_amount, difference, accounting_sessions!inner(branch_id, status)')
        .neq('difference', 0)
        .not('item_type', 'in', '(coin_amount,expenses)');
      if (activeBranch?.id) query = query.eq('accounting_sessions.branch_id', activeBranch.id);
      const { data } = await query;
      return (data || []).map((d: any) => ({
        item_type: d.item_type,
        expected: Number(d.expected_amount),
        actual: Number(d.actual_amount),
        difference: Number(d.difference),
      }));
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [detailsCategory, setDetailsCategory] = useState<'cash_invoice1' | 'cash_invoice2' | 'check' | 'bank_receipt' | 'bank_transfer' | null>(null);
  const [addForm, setAddForm] = useState({ payment_method: 'cash_invoice1', amount: '', customer_name: '', invoice_number: '', invoice_date: '', check_number: '', check_bank: '', check_date: '', receipt_number: '', transfer_reference: '', notes: '' });
  const [handoverForm, setHandoverForm] = useState({ cash_invoice1: '', cash_invoice2: '', notes: '' });
  const [pickedChecks, setPickedChecks] = useState<PickedItem[]>([]);
  const [pickedReceipts, setPickedReceipts] = useState<PickedItem[]>([]);
  const [pickedTransfers, setPickedTransfers] = useState<PickedItem[]>([]);
  const [pickerType, setPickerType] = useState<'check' | 'receipt' | 'transfer' | null>(null);

  const handleAddEntry = async () => {
    if (!addForm.amount || Number(addForm.amount) <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    try {
      await addEntry.mutateAsync({
        payment_method: addForm.payment_method.startsWith('cash') ? 'cash' : addForm.payment_method,
        amount: Number(addForm.amount),
        customer_name: addForm.customer_name || undefined,
        invoice_number: addForm.invoice_number || undefined,
        invoice_date: addForm.invoice_date || undefined,
        check_number: addForm.check_number || undefined,
        check_bank: addForm.check_bank || undefined,
        check_date: addForm.check_date || undefined,
        receipt_number: addForm.receipt_number || undefined,
        transfer_reference: addForm.transfer_reference || undefined,
        notes: addForm.notes || undefined,
      });
      toast.success('تم إضافة المبلغ بنجاح');
      setAddOpen(false);
      setAddForm({ payment_method: 'cash_invoice1', amount: '', customer_name: '', invoice_number: '', invoice_date: '', check_number: '', check_bank: '', check_date: '', receipt_number: '', transfer_reference: '', notes: '' });
    } catch {
      toast.error('حدث خطأ');
    }
  };

  const checksAmount = pickedChecks.reduce((s, i) => s + i.amount, 0);
  const receiptsAmount = pickedReceipts.reduce((s, i) => s + i.amount, 0);
  const transfersAmount = pickedTransfers.reduce((s, i) => s + i.amount, 0);

  const handleHandover = async () => {
    const total = Number(handoverForm.cash_invoice1 || 0) + Number(handoverForm.cash_invoice2 || 0) +
                  checksAmount + receiptsAmount + transfersAmount;
    if (total <= 0) {
      toast.error('أدخل مبلغاً واحداً على الأقل');
      return;
    }
    try {
      const { data: handover, error } = await supabase.from('manager_handovers').insert({
        manager_id: workerId!,
        branch_id: activeBranch?.id || null,
        payment_method: 'mixed',
        amount: total,
        cash_invoice1: Number(handoverForm.cash_invoice1) || 0,
        cash_invoice2: Number(handoverForm.cash_invoice2) || 0,
        checks_amount: checksAmount,
        check_count: pickedChecks.length,
        receipts_amount: receiptsAmount,
        receipt_count: pickedReceipts.length,
        transfers_amount: transfersAmount,
        transfer_count: pickedTransfers.length,
        notes: handoverForm.notes || null,
      }).select('id').single();

      if (error) throw error;

      // Save handover items for tracking
      const allItems = [
        ...pickedChecks.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'check', amount: i.amount, customer_name: i.customer_name })),
        ...pickedReceipts.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'receipt', amount: i.amount, customer_name: i.customer_name })),
        ...pickedTransfers.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'transfer', amount: i.amount, customer_name: i.customer_name })),
      ];
      if (allItems.length > 0) {
        await supabase.from('handover_items').insert(allItems);
      }

      toast.success('تم تسجيل التسليم بنجاح');
      setHandoverOpen(false);
      setHandoverForm({ cash_invoice1: '', cash_invoice2: '', notes: '' });
      setPickedChecks([]);
      setPickedReceipts([]);
      setPickedTransfers([]);
      queryClient.invalidateQueries({ queryKey: ['manager-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
      queryClient.invalidateQueries({ queryKey: ['handover-picker'] });
    } catch (err: any) {
      toast.error('حدث خطأ: ' + (err.message || ''));
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">خزينة المدير</h1>
        <div className="flex gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-4 h-4 ml-1" />إضافة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>إضافة مبلغ يدوي</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <InvoiceOCRScanner
                  paymentMethod={addForm.payment_method.startsWith('cash') ? 'cash' : addForm.payment_method}
                  onDataExtracted={(data) => {
                    setAddForm(f => ({
                      ...f,
                      amount: data.amount || f.amount,
                      customer_name: data.customer_name || f.customer_name,
                      invoice_number: data.invoice_number || f.invoice_number,
                      invoice_date: data.invoice_date || f.invoice_date,
                      check_number: data.check_number || f.check_number,
                      check_bank: data.check_bank || f.check_bank,
                      check_date: data.check_date || f.check_date,
                      receipt_number: data.receipt_number || f.receipt_number,
                      transfer_reference: data.transfer_reference || f.transfer_reference,
                      notes: data.raw_text ? (f.notes ? f.notes + '\n---\n' + data.raw_text : data.raw_text) : f.notes,
                    }));
                  }}
                />
                <div>
                  <Label className="mb-2 block">طريقة الدفع</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(paymentMethodLabels).map(([k, v]) => {
                      const Icon = v.icon;
                      return (
                        <Button
                          key={k}
                          type="button"
                          size="sm"
                          variant={addForm.payment_method === k ? 'default' : 'outline'}
                          className="gap-1 text-xs h-9"
                          onClick={() => setAddForm(f => ({ ...f, payment_method: k }))}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {v.ar}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>اسم العميل</Label>
                  <Input placeholder="اسم العميل" value={addForm.customer_name} onChange={e => setAddForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <Label>المبلغ</Label>
                  <Input type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                {/* رقم الفاتورة */}
                <div>
                  <Label>رقم الفاتورة</Label>
                  <Input placeholder="رقم الفاتورة" value={addForm.invoice_number} onChange={e => setAddForm(f => ({ ...f, invoice_number: e.target.value }))} />
                </div>
                <div>
                  <Label>تاريخ الفاتورة</Label>
                  <Input type="date" value={addForm.invoice_date} onChange={e => setAddForm(f => ({ ...f, invoice_date: e.target.value }))} />
                </div>
                {addForm.payment_method === 'check' && (
                  <>
                    <div><Label>رقم الشيك</Label><Input value={addForm.check_number} onChange={e => setAddForm(f => ({ ...f, check_number: e.target.value }))} /></div>
                    <div><Label>البنك</Label><Input value={addForm.check_bank} onChange={e => setAddForm(f => ({ ...f, check_bank: e.target.value }))} /></div>
                    <div><Label>تاريخ الشيك</Label><Input type="date" value={addForm.check_date} onChange={e => setAddForm(f => ({ ...f, check_date: e.target.value }))} /></div>
                  </>
                )}
                {addForm.payment_method === 'bank_receipt' && (
                  <div><Label>رقم وصل الفيرسمو</Label><Input value={addForm.receipt_number} onChange={e => setAddForm(f => ({ ...f, receipt_number: e.target.value }))} /></div>
                )}
                {addForm.payment_method === 'bank_transfer' && (
                  <div><Label>مرجع الفيرمو</Label><Input value={addForm.transfer_reference} onChange={e => setAddForm(f => ({ ...f, transfer_reference: e.target.value }))} /></div>
                )}
                <div><Label>ملاحظات</Label><Textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleAddEntry} disabled={addEntry.isPending} className="w-full">إضافة</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Send className="w-4 h-4 ml-1" />تسليم</Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>تسليم أموال للجهة العليا</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <p className="font-medium text-sm">💵 الكاش</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">كاش فاتورة 1</Label><Input type="number" placeholder="0" value={handoverForm.cash_invoice1} onChange={e => setHandoverForm(f => ({ ...f, cash_invoice1: e.target.value }))} /></div>
                    <div><Label className="text-xs">كاش فاتورة 2</Label><Input type="number" placeholder="0" value={handoverForm.cash_invoice2} onChange={e => setHandoverForm(f => ({ ...f, cash_invoice2: e.target.value }))} /></div>
                  </div>
                </div>
                <PickerSection label="📝 شيكات" items={pickedChecks} onOpen={() => setPickerType('check')} onRemove={(id) => setPickedChecks(p => p.filter(i => i.order_id !== id))} />
                <PickerSection label="🧾 فيرسمو" items={pickedReceipts} onOpen={() => setPickerType('receipt')} onRemove={(id) => setPickedReceipts(p => p.filter(i => i.order_id !== id))} />
                <PickerSection label="🏦 فيرمو" items={pickedTransfers} onOpen={() => setPickerType('transfer')} onRemove={(id) => setPickedTransfers(p => p.filter(i => i.order_id !== id))} />
                
                {/* Total summary */}
                {(Number(handoverForm.cash_invoice1 || 0) + Number(handoverForm.cash_invoice2 || 0) + checksAmount + receiptsAmount + transfersAmount) > 0 && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">إجمالي التسليم</span>
                      <span className="text-sm font-bold text-primary">
                        {(Number(handoverForm.cash_invoice1 || 0) + Number(handoverForm.cash_invoice2 || 0) + checksAmount + receiptsAmount + transfersAmount).toLocaleString()} د.ج
                      </span>
                    </div>
                  </div>
                )}

                <div><Label>ملاحظات</Label><Textarea value={handoverForm.notes} onChange={e => setHandoverForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleHandover} disabled={createHandover.isPending} className="w-full">تسجيل التسليم</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Item Picker Dialog */}
          {pickerType && (
            <HandoverItemPickerDialog
              open={!!pickerType}
              onOpenChange={(open) => !open && setPickerType(null)}
              paymentMethod={pickerType}
              onConfirm={(items) => {
                if (pickerType === 'check') setPickedChecks(prev => [...prev, ...items]);
                else if (pickerType === 'receipt') setPickedReceipts(prev => [...prev, ...items]);
                else if (pickerType === 'transfer') setPickedTransfers(prev => [...prev, ...items]);
              }}
            />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <TreasuryCard
          icon={<Banknote className="w-5 h-5 text-green-500" />}
          label={`كاش فاتورة 1 (${summary?.cash_invoice1_count || 0})`}
          total={summary?.cash_invoice1 || 0}
          handed={(handovers || []).reduce((s, h: any) => s + Number(h.cash_invoice1 || 0), 0)}
          colorClass="green-500"
          borderClass="border-green-500/30 bg-green-500/5"
          onClick={() => setDetailsCategory('cash_invoice1')}
        />
        <TreasuryCard
          icon={<Banknote className="w-5 h-5 text-emerald-500" />}
          label={`كاش فاتورة 2 (${summary?.cash_invoice2_count || 0})`}
          total={summary?.cash_invoice2 || 0}
          handed={(handovers || []).reduce((s, h: any) => s + Number(h.cash_invoice2 || 0), 0)}
          colorClass="emerald-500"
          borderClass="border-emerald-500/30 bg-emerald-500/5"
          onClick={() => setDetailsCategory('cash_invoice2')}
        />
        <TreasuryCard
          icon={<CreditCard className="w-5 h-5 text-blue-500" />}
          label={`شيكات (${summary?.checkCount || 0})`}
          total={summary?.check || 0}
          handed={summary?.check_handed || 0}
          colorClass="blue-500"
          borderClass="border-blue-500/30 bg-blue-500/5"
          onClick={() => setDetailsCategory('check')}
        />
        <TreasuryCard
          icon={<Receipt className="w-5 h-5 text-purple-500" />}
          label={`فيرسمو (${summary?.receiptCount || 0})`}
          total={summary?.bank_receipt || 0}
          handed={summary?.receipt_handed || 0}
          colorClass="purple-500"
          borderClass="border-purple-500/30 bg-purple-500/5"
          onClick={() => setDetailsCategory('bank_receipt')}
        />
        <TreasuryCard
          icon={<ArrowUpRight className="w-5 h-5 text-orange-500" />}
          label={`فيرمو (${summary?.transferCount || 0})`}
          total={summary?.bank_transfer || 0}
          handed={summary?.transfer_handed || 0}
          colorClass="orange-500"
          borderClass="border-orange-500/30 bg-orange-500/5"
          onClick={() => setDetailsCategory('bank_transfer')}
        />
        <Card className="border-amber-600/30 bg-amber-600/5">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground leading-tight">إجمالي الطوابع (ضريبة على فاتورة 1)</p>
            <p className="text-sm font-bold text-amber-600 truncate">{(summary?.cash_invoice1_stamp || 0).toLocaleString()} د.ج</p>
          </CardContent>
        </Card>
      </div>

      {detailsCategory && (
        <PaymentMethodDetailsDialog
          open={!!detailsCategory}
          onOpenChange={(open) => !open && setDetailsCategory(null)}
          category={detailsCategory}
        />
      )}

      {/* المبيعات والديون */}
      <Card className="border-muted">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">ملخص المبيعات والديون</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">قيمة المبيعات</p>
              <p className="text-sm font-bold text-green-600 truncate">{(summary?.totalSales || 0).toLocaleString()} د.ج</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">المستلم (خزينة)</p>
              <p className="text-sm font-bold truncate">{summary?.total?.toLocaleString() || 0} د.ج</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-2 text-center">
              <AlertCircle className="w-3 h-3 mx-auto mb-0.5 text-orange-500" />
              <p className="text-[10px] text-muted-foreground">إجمالي الديون</p>
              <p className="text-xs font-bold text-orange-500 truncate">{(summary?.totalDebts || 0).toLocaleString()} د.ج</p>
            </div>
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2 text-center">
              <CheckCircle className="w-3 h-3 mx-auto mb-0.5 text-green-500" />
              <p className="text-[10px] text-muted-foreground">ديون محصّلة</p>
              <p className="text-xs font-bold text-green-500 truncate">{(summary?.collectedDebts || 0).toLocaleString()} د.ج</p>
            </div>
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-2 text-center">
              <AlertCircle className="w-3 h-3 mx-auto mb-0.5 text-destructive" />
              <p className="text-[10px] text-muted-foreground">ديون غير محصّلة</p>
              <p className="text-xs font-bold text-destructive truncate">{(summary?.uncollectedDebts || 0).toLocaleString()} د.ج</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total & Remaining */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">الإجمالي</p>
            <p className="text-sm font-bold truncate">{summary?.total?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">المُسلَّم</p>
            <p className="text-sm font-bold text-destructive truncate">{summary?.handedOver?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
      </div>

      {/* المتبقي الكلي مع التفصيل */}
      {(() => {
        const cashPhysical = (summary?.cash_invoice1 || 0) + (summary?.cash_invoice2 || 0);
        const nonCash = (summary?.check || 0) + (summary?.bank_receipt || 0) + (summary?.bank_transfer || 0);
        const nonCashHanded = (summary?.check_handed || 0) + (summary?.receipt_handed || 0) + (summary?.transfer_handed || 0);
        const cashHandedOver = (summary?.handedOver || 0) - nonCashHanded;
        const nonCashPending = nonCash - nonCashHanded;
        const physicalRemaining = cashPhysical - cashHandedOver;
        const paperMoney = physicalRemaining - (summary?.coins || 0);
        return (
          <div className="space-y-3">
            {/* المتبقي الكلي */}
            <Card className="border-primary/30">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">المتبقي الكلي</p>
                <p className="text-base font-bold text-primary truncate">{summary?.remaining?.toLocaleString() || 0} د.ج</p>
              </CardContent>
            </Card>

            {/* القسم 1: مستلم مادياً */}
            <Card className="border-green-500/20">
              <CardContent className="p-3 space-y-2">
                <div className="text-center">
                  <p className="text-[11px] font-medium text-muted-foreground">💵 الكاش المتبقي بعد التسليم</p>
                  <p className="text-sm font-bold truncate">{Math.max(physicalRemaining, 0).toLocaleString()} د.ج</p>
                </div>
                {(summary?.coins || 0) > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground text-center">تقسيم الكاش المتبقي:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/50 p-2 text-center">
                        <Banknote className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">ورقي</p>
                        <p className="text-xs font-bold truncate">{Math.max(paperMoney, 0).toLocaleString()} د.ج</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2 text-center">
                        <Coins className="w-3.5 h-3.5 mx-auto mb-0.5 text-amber-500" />
                        <p className="text-[10px] text-muted-foreground">معدني (من المتبقي)</p>
                        <p className="text-xs font-bold text-amber-500 truncate">{(summary?.coins || 0).toLocaleString()} د.ج</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* القسم 2: غير مستلم مادياً */}
            <Card className="border-blue-500/20">
              <CardContent className="p-3 text-center">
                <p className="text-[11px] font-medium text-muted-foreground">🏦 غير مستلم مادياً (معلّق)</p>
                <p className="text-sm font-bold truncate">{nonCashPending.toLocaleString()} د.ج</p>
                <p className="text-[10px] text-muted-foreground mt-1">(شيكات + فيرسمو + فيرمو غير مسلّمة)</p>
                {nonCashHanded > 0 && <p className="text-[10px] text-green-500 mt-0.5">مسلّم: {nonCashHanded.toLocaleString()} د.ج</p>}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ميزانية الخزينة - دراسة الفجوات */}
      {(() => {
        const totalSales = summary?.totalSales || 0;
        const orderUnpaidAmount = summary?.orderUnpaidAmount || 0;
        const debtCashCollected = summary?.debtCashCollected || 0;
        const totalInTreasury = summary?.total || 0;
        const handedOver = summary?.handedOver || 0;
        const totalExpenses = summary?.totalExpenses || 0;
        const totalGiftsValue = summary?.totalGiftsValue || 0;
        const workerHeldAmount = summary?.workerHeldAmount || 0;
        
        // المتوقع = المبيعات - المبالغ غير المدفوعة + تحصيلات ديون نقدية
        const expectedInTreasury = totalSales - orderUnpaidAmount + debtCashCollected;
        // الصافي = الوارد - المسلم - المصاريف (ما يجب أن يكون فعلياً في الخزينة الآن)
        const netInTreasury = totalInTreasury - handedOver - totalExpenses;
        // أين ذهبت الأموال: الصافي + المسلم + المصاريف + ذمة العمال = المتوقع
        const accountedFor = netInTreasury + handedOver + totalExpenses + workerHeldAmount;
        const gap = expectedInTreasury - accountedFor;
        const hasGap = Math.abs(gap) > 1;
        
        return (
          <Card className={`border-2 ${hasGap ? 'border-orange-500/30 bg-orange-500/5' : 'border-green-500/20 bg-green-500/5'}`}>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-center gap-2">
                {hasGap ? <AlertTriangle className="w-4 h-4 text-orange-500" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
                <p className={`text-xs font-bold ${hasGap ? 'text-orange-600' : 'text-green-600'}`}>⚖️ ميزانية الخزينة</p>
                <button onClick={() => setInfoOpen(true)} className="p-0.5 rounded-full hover:bg-muted">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">إجمالي المبيعات</span>
                  <span className="text-xs font-bold">{totalSales.toLocaleString()} د.ج</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">− غير مدفوع (ديون + دفع جزئي)</span>
                  <span className="text-xs font-bold text-orange-500">−{orderUnpaidAmount.toLocaleString()} د.ج</span>
                </div>
                {debtCashCollected > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-background p-2">
                    <span className="text-[10px] text-muted-foreground">+ تحصيلات ديون نقدية</span>
                    <span className="text-xs font-bold text-green-500">+{debtCashCollected.toLocaleString()} د.ج</span>
                  </div>
                )}
                <div className="border-t pt-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 p-2">
                    <span className="text-[10px] font-medium">= المتوقع في الخزينة</span>
                    <span className="text-xs font-bold text-primary">{expectedInTreasury.toLocaleString()} د.ج</span>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground text-center pt-1">📤 أين ذهبت الأموال؟</p>

                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">الموجود فعلياً (بعد التسليم والمصاريف)</span>
                  <span className="text-xs font-bold">{netInTreasury.toLocaleString()} د.ج</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">المُسلَّم للجهة العليا</span>
                  <span className="text-xs font-bold">{handedOver.toLocaleString()} د.ج</span>
                </div>
                {totalExpenses > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-background p-2">
                    <span className="text-[10px] text-muted-foreground">المصاريف المعتمدة</span>
                    <span className="text-xs font-bold">{totalExpenses.toLocaleString()} د.ج</span>
                  </div>
                )}
                {workerHeldAmount > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-500/5 border border-amber-500/20 p-2">
                    <span className="text-[10px] text-muted-foreground">👷 في ذمة العمال (لم تُسلَّم بعد)</span>
                    <span className="text-xs font-bold text-amber-600">{workerHeldAmount.toLocaleString()} د.ج</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                  <span className="text-[10px] font-medium">= مجموع التصرف</span>
                  <span className="text-xs font-bold">{accountedFor.toLocaleString()} د.ج</span>
                </div>
              </div>

              <div className={`rounded-lg p-2.5 text-center ${hasGap ? (gap > 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-green-500/10 border border-green-500/20') : 'bg-green-500/10 border border-green-500/20'}`}>
                {hasGap ? (
                  <>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {gap > 0 ? '⚠️ عجز في الخزينة' : '💰 فائض في الخزينة'}
                    </p>
                    <p className={`text-sm font-bold ${gap > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {Math.abs(gap).toLocaleString()} د.ج
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {gap > 0 ? 'المتوقع أكبر مما تم التصرف فيه — يرجى التحقق' : 'تم التصرف بأكثر مما هو متوقع'}
                    </p>
                  </>
                ) : (
                  <p className="text-xs font-medium text-green-600">✅ الميزانية متوازنة — لا توجد فجوات</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* زر معلومات + نافذة الشرح */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📊 كيف يتم اكتشاف الفروقات؟</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="font-bold text-sm">🔍 المبدأ العام</p>
              <p className="text-xs text-muted-foreground">عند إنشاء جلسة محاسبة، يقوم النظام تلقائياً بحساب المبالغ المتوقعة من الطلبيات المُسلَّمة، ثم يقارنها بما يُدخله المحاسب فعلياً.</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="font-bold text-sm">📋 البنود التي تتم مقارنتها</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>فاتورة 1 - كاش:</strong> مجموع المدفوعات النقدية للطلبيات بفاتورة</li>
                <li><strong>فاتورة 1 - شيك/تحويل/فيرسمو:</strong> مجموع كل طريقة دفع</li>
                <li><strong>فاتورة 2 - كاش:</strong> مجموع المدفوعات بدون فاتورة</li>
                <li><strong>تحصيلات الديون:</strong> مجموع المبالغ المحصّلة من الديون</li>
                <li><strong>الكاش المادي:</strong> إجمالي الكاش الذي يجب أن يكون بيد العامل</li>
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <p className="font-bold text-sm">💡 مثال توضيحي</p>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>لنفرض أن عاملاً سلّم 10 طلبيات خلال الفترة:</p>
                <div className="bg-background rounded p-2 space-y-1">
                  <p>• 5 طلبيات فاتورة 1 كاش = <strong>500,000 د.ج</strong></p>
                  <p>• 2 طلبية فاتورة 1 شيك = <strong>200,000 د.ج</strong></p>
                  <p>• 3 طلبيات فاتورة 2 كاش = <strong>150,000 د.ج</strong></p>
                  <p>• تحصيل ديون نقدي = <strong>50,000 د.ج</strong></p>
                </div>
                <p className="font-medium">النظام يتوقع:</p>
                <div className="bg-background rounded p-2 space-y-1">
                  <p>• الكاش المادي = 500,000 + 150,000 + 50,000 = <strong>700,000 د.ج</strong></p>
                </div>
                <p className="font-medium">المحاسب يُدخل:</p>
                <div className="bg-background rounded p-2 space-y-1">
                  <p>• الكاش المادي الفعلي = <strong>690,000 د.ج</strong></p>
                </div>
                <p className="font-medium text-destructive">← فرق (عجز) = 10,000 د.ج ⚠️</p>
                <p className="text-muted-foreground/70 mt-1">هذا يعني أن هناك نقص 10,000 د.ج في الكاش المُسلَّم مقارنة بما هو متوقع.</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="font-bold text-sm">⚠️ بنود مستثناة</p>
              <p className="text-xs text-muted-foreground"><strong>العملات المعدنية</strong> و<strong>المصاريف</strong> لا تظهر في الفروقات لأنها بنود تسجيلية يُدخلها المحاسب يدوياً وليس لها مبلغ متوقع نظامياً.</p>
            </div>

            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 space-y-1">
              <p className="font-bold text-sm text-green-600">✅ متى تكون المحاسبة سليمة؟</p>
              <p className="text-xs text-muted-foreground">عندما تتطابق جميع المبالغ المتوقعة مع المبالغ الفعلية المُسجَّلة (الفرق = 0 لكل بند).</p>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="font-bold text-sm">⚖️ ميزانية الخزينة (دراسة الفجوات)</p>
              
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <p className="font-medium text-xs">المعادلة الأساسية:</p>
                <div className="bg-background rounded p-2 text-xs space-y-1">
                  <p><strong>المتوقع</strong> = إجمالي المبيعات − غير المدفوع (ديون + جزئي) + تحصيلات ديون نقدية</p>
                  <p><strong>مجموع التصرف</strong> = الموجود في الخزينة + المُسلَّم + المصاريف + <strong>في ذمة العمال 👷</strong></p>
                  <p><strong>الفجوة</strong> = المتوقع − مجموع التصرف</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">💡 الهدايا لا تُطرح لأن قيمتها غير مشمولة في إجمالي المبيعات أصلاً. تحصيلات الديون النقدية = مبالغ فعلية دخلت الخزينة.</p>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <p className="font-medium text-xs">💡 مثال:</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="bg-background rounded p-2 space-y-1">
                    <p>• مبيعات = <strong>1,000,000 د.ج</strong></p>
                    <p>• ديون جديدة = <strong>200,000 د.ج</strong></p>
                    <p>• تحصيلات ديون سابقة = <strong>50,000 د.ج</strong></p>
                    <p>• تحصيلات ديون نقدية = <strong>50,000 د.ج</strong></p>
                  </div>
                  <p className="font-medium mt-1">المتوقع = 1,000,000 − 200,000 + 50,000 = <strong>850,000 د.ج</strong></p>
                  <div className="bg-background rounded p-2 space-y-1 mt-1">
                    <p>• الموجود في الخزينة = <strong>790,000 د.ج</strong></p>
                    <p>• المُسلَّم = <strong>30,000 د.ج</strong></p>
                    <p>• المصاريف = <strong>10,000 د.ج</strong></p>
                  </div>
                  <p className="font-medium mt-1">مجموع التصرف = 800,000 + 30,000 + 10,000 + 10,000 = <strong>850,000 د.ج</strong></p>
                  <p className="text-green-600 font-medium">✅ لا توجد فجوة — الميزانية متوازنة</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* اختلالات المحاسبة */}
      {discrepancies && discrepancies.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <p className="text-xs font-medium text-destructive">فروقات في المحاسبة ({discrepancies.length})</p>
              <button onClick={() => setInfoOpen(true)} className="p-0.5 rounded-full hover:bg-muted">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              مقارنة بين ما يجب أن يكون (حسب النظام) وما تم تسجيله فعلياً في جلسة المحاسبة
            </p>
            <div className="space-y-1.5">
              {discrepancies.map((d, i) => {
                const isSurplus = d.difference > 0;
                return (
                  <div key={i} className="rounded-lg bg-background p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{itemTypeLabels[d.item_type] || d.item_type}</span>
                      <Badge variant={isSurplus ? 'default' : 'destructive'} className="text-[10px]">
                        {isSurplus ? 'فائض' : 'عجز'} {Math.abs(d.difference).toLocaleString()} د.ج
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>📊 المتوقع (النظام): {d.expected.toLocaleString()} د.ج</span>
                      <span>✅ الفعلي (المُسجَّل): {d.actual.toLocaleString()} د.ج</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80">
                      {isSurplus 
                        ? `💡 تم تسجيل مبلغ أعلى بـ ${Math.abs(d.difference).toLocaleString()} د.ج مما هو متوقع حسب النظام`
                        : `⚠️ ينقص ${Math.abs(d.difference).toLocaleString()} د.ج عن المبلغ المتوقع حسب النظام`
                      }
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(!discrepancies || discrepancies.length === 0) && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <p className="text-xs font-medium text-green-600">لا توجد فروقات في المحاسبة ✓</p>
              <button onClick={() => setInfoOpen(true)} className="p-0.5 rounded-full hover:bg-muted">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Entries & Handovers */}
      <Tabs defaultValue="entries" dir="rtl">
        <TabsList className="w-full">
          <TabsTrigger value="entries" className="flex-1">المستلمات</TabsTrigger>
          <TabsTrigger value="handovers" className="flex-1">التسليمات</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-2 mt-2">
          {(!entries || entries.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">لا توجد مستلمات بعد</p>
          ) : entries.map(entry => {
            const method = paymentMethodLabels[entry.payment_method];
            return (
              <Card key={entry.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      {method?.icon && <method.icon className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-medium">{Number(entry.amount).toLocaleString()} د.ج</p>
                      <p className="text-xs text-muted-foreground">
                        {method?.ar || entry.payment_method}
                        {(entry as any).invoice_number && ` - فاتورة #${(entry as any).invoice_number}`}
                        {entry.check_number && ` - شيك #${entry.check_number}`}
                        {entry.receipt_number && ` - وصل #${entry.receipt_number}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <Badge variant={entry.source_type === 'accounting_session' ? 'default' : 'secondary'}>
                      {entry.source_type === 'accounting_session' ? 'محاسبة' : 'يدوي'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(entry.created_at), 'dd/MM HH:mm', { locale: ar })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="handovers" className="space-y-2 mt-2">
          {(!handovers || handovers.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">لا توجد تسليمات بعد</p>
          ) : handovers.map(h => {
            return (
              <Card key={h.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-destructive" />
                      <p className="font-bold">{Number(h.amount).toLocaleString()} د.ج</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(h.created_at), 'dd/MM/yyyy', { locale: ar })}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Number(h.cash_invoice1 ?? 0) > 0 && <p>كاش ف1: {Number(h.cash_invoice1).toLocaleString()} د.ج</p>}
                    {Number(h.cash_invoice2 ?? 0) > 0 && <p>كاش ف2: {Number(h.cash_invoice2).toLocaleString()} د.ج</p>}
                    {Number(h.checks_amount ?? 0) > 0 && <p>شيكات: {Number(h.checks_amount).toLocaleString()} د.ج ({h.check_count ?? 0})</p>}
                    {Number(h.receipts_amount ?? 0) > 0 && <p>فيرسمو: {Number(h.receipts_amount).toLocaleString()} د.ج ({h.receipt_count ?? 0})</p>}
                    {Number(h.transfers_amount ?? 0) > 0 && <p>فيرمو: {Number(h.transfers_amount).toLocaleString()} د.ج ({(h as any).transfer_count ?? 0})</p>}
                  </div>
                  {h.notes && <p className="text-xs text-muted-foreground">{h.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Helper component for picker sections in handover dialog
const PickerSection = ({ label, items, onOpen, onRemove }: {
  label: string;
  items: PickedItem[];
  onOpen: () => void;
  onRemove: (orderId: string) => void;
}) => {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{label}</p>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={(e) => { e.preventDefault(); onOpen(); }}>
          + اختيار
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.order_id} className="flex items-center justify-between text-xs bg-background rounded-md px-2 py-1.5 border">
              <span className="truncate flex-1">{item.customer_name}</span>
              <span className="font-bold mx-2 whitespace-nowrap">{item.amount.toLocaleString()} د.ج</span>
              <button onClick={(e) => { e.preventDefault(); onRemove(item.order_id); }} className="text-destructive hover:text-destructive/80 text-xs">✕</button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs pt-1 border-t">
            <span className="text-muted-foreground">{items.length} عنصر</span>
            <span className="font-bold">{total.toLocaleString()} د.ج</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">لم يتم اختيار أي عنصر</p>
      )}
    </div>
  );
};

export default ManagerTreasury;
