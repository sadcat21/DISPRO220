import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTreasurySummary, useManagerTreasury, useManagerHandovers, useCreateHandover, useAddTreasuryEntry } from '@/hooks/useManagerTreasury';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PaymentMethodDetailsDialog from '@/components/treasury/PaymentMethodDetailsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Banknote, CreditCard, Receipt, ArrowUpRight, Plus, Send, Coins } from 'lucide-react';
import { toast } from 'sonner';
import InvoiceOCRScanner from '@/components/treasury/InvoiceOCRScanner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const paymentMethodLabels: Record<string, { ar: string; icon: any }> = {
  cash_invoice1: { ar: 'كاش فاتورة 1', icon: Banknote },
  cash_invoice2: { ar: 'كاش فاتورة 2', icon: Coins },
  check: { ar: 'شيك', icon: CreditCard },
  bank_receipt: { ar: 'فيرسمو', icon: Receipt },
  bank_transfer: { ar: 'فيرمو', icon: ArrowUpRight },
};

const ManagerTreasury = () => {
  const { t } = useLanguage();
  const { data: summary, isLoading: summaryLoading } = useTreasurySummary();
  const { data: entries } = useManagerTreasury();
  const { data: handovers } = useManagerHandovers();
  const createHandover = useCreateHandover();
  const addEntry = useAddTreasuryEntry();

  const [addOpen, setAddOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [detailsCategory, setDetailsCategory] = useState<'cash_invoice1' | 'cash_invoice2' | 'check' | 'bank_receipt' | 'bank_transfer' | null>(null);
  const [addForm, setAddForm] = useState({ payment_method: 'cash_invoice1', amount: '', customer_name: '', invoice_number: '', invoice_date: '', check_number: '', check_bank: '', check_date: '', receipt_number: '', transfer_reference: '', notes: '' });
  const [handoverForm, setHandoverForm] = useState({ cash_invoice1: '', cash_invoice2: '', checks_amount: '', check_count: '', receipts_amount: '', receipt_count: '', transfers_amount: '', transfer_count: '', notes: '' });

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

  const handleHandover = async () => {
    const total = Number(handoverForm.cash_invoice1 || 0) + Number(handoverForm.cash_invoice2 || 0) +
                  Number(handoverForm.checks_amount || 0) + Number(handoverForm.receipts_amount || 0) +
                  Number(handoverForm.transfers_amount || 0);
    if (total <= 0) {
      toast.error('أدخل مبلغاً واحداً على الأقل');
      return;
    }
    try {
      await createHandover.mutateAsync({
        cash_invoice1: Number(handoverForm.cash_invoice1) || 0,
        cash_invoice2: Number(handoverForm.cash_invoice2) || 0,
        checks_amount: Number(handoverForm.checks_amount) || 0,
        check_count: Number(handoverForm.check_count) || 0,
        receipts_amount: Number(handoverForm.receipts_amount) || 0,
        receipt_count: Number(handoverForm.receipt_count) || 0,
        transfers_amount: Number(handoverForm.transfers_amount) || 0,
        transfer_count: Number(handoverForm.transfer_count) || 0,
        notes: handoverForm.notes || undefined,
      });
      toast.success('تم تسجيل التسليم بنجاح');
      setHandoverOpen(false);
      setHandoverForm({ cash_invoice1: '', cash_invoice2: '', checks_amount: '', check_count: '', receipts_amount: '', receipt_count: '', transfers_amount: '', transfer_count: '', notes: '' });
    } catch {
      toast.error('حدث خطأ');
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
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <p className="font-medium text-sm">📝 شيكات</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">قيمة الشيكات</Label><Input type="number" placeholder="0" value={handoverForm.checks_amount} onChange={e => setHandoverForm(f => ({ ...f, checks_amount: e.target.value }))} /></div>
                    <div><Label className="text-xs">عدد الشيكات</Label><Input type="number" placeholder="0" value={handoverForm.check_count} onChange={e => setHandoverForm(f => ({ ...f, check_count: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <p className="font-medium text-sm">🧾 فيرسمو (إيداع كاش بالبنك)</p>
                  <p className="text-[10px] text-muted-foreground">العميل يأخذ الكاش ويودعه في حساب الشركة بالبنك</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">قيمة الفيرسمو</Label><Input type="number" placeholder="0" value={handoverForm.receipts_amount} onChange={e => setHandoverForm(f => ({ ...f, receipts_amount: e.target.value }))} /></div>
                    <div><Label className="text-xs">عدد الوصولات</Label><Input type="number" placeholder="0" value={handoverForm.receipt_count} onChange={e => setHandoverForm(f => ({ ...f, receipt_count: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <p className="font-medium text-sm">🏦 فيرمو (تحويل بنكي)</p>
                  <p className="text-[10px] text-muted-foreground">العميل يحوّل من حسابه البنكي إلى حساب الشركة</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">قيمة الفيرمو</Label><Input type="number" placeholder="0" value={handoverForm.transfers_amount} onChange={e => setHandoverForm(f => ({ ...f, transfers_amount: e.target.value }))} /></div>
                    <div><Label className="text-xs">عدد الوصولات</Label><Input type="number" placeholder="0" value={handoverForm.transfer_count} onChange={e => setHandoverForm(f => ({ ...f, transfer_count: e.target.value }))} /></div>
                  </div>
                </div>
                <div><Label>ملاحظات</Label><Textarea value={handoverForm.notes} onChange={e => setHandoverForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleHandover} disabled={createHandover.isPending} className="w-full">تسجيل التسليم</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-500/30 bg-green-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailsCategory('cash_invoice1')}>
          <CardContent className="p-3 text-center">
            <Banknote className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <p className="text-xs text-muted-foreground">كاش فاتورة 1 ({summary?.cash_invoice1_count || 0})</p>
            <p className="text-sm font-bold text-green-500 truncate">{summary?.cash_invoice1?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailsCategory('cash_invoice2')}>
          <CardContent className="p-3 text-center">
            <Banknote className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-xs text-muted-foreground">كاش فاتورة 2 ({summary?.cash_invoice2_count || 0})</p>
            <p className="text-sm font-bold text-emerald-500 truncate">{summary?.cash_invoice2?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30 bg-blue-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailsCategory('check')}>
          <CardContent className="p-3 text-center">
            <CreditCard className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xs text-muted-foreground">شيكات ({summary?.checkCount || 0})</p>
            <p className="text-sm font-bold text-blue-500 truncate">{summary?.check?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-purple-500/30 bg-purple-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailsCategory('bank_receipt')}>
          <CardContent className="p-3 text-center">
            <Receipt className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-xs text-muted-foreground">فيرسمو ({summary?.receiptCount || 0})</p>
            <p className="text-sm font-bold text-purple-500 truncate">{summary?.bank_receipt?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30 bg-orange-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailsCategory('bank_transfer')}>
          <CardContent className="p-3 text-center">
            <ArrowUpRight className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className="text-xs text-muted-foreground">فيرمو ({summary?.transferCount || 0})</p>
            <p className="text-sm font-bold text-orange-500 truncate">{summary?.bank_transfer?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
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
        const physicalRemaining = cashPhysical - (summary?.handedOver || 0);
        const paperMoney = physicalRemaining - (summary?.coins || 0);
        return (
          <Card className="border-primary/30">
            <CardContent className="p-3 space-y-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">المتبقي الكلي</p>
                <p className="text-base font-bold text-primary truncate">{summary?.remaining?.toLocaleString() || 0} د.ج</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* القسم 1: مستلم مادياً */}
                <div className="rounded-lg bg-muted/50 p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground text-center">💵 مستلم مادياً (كاش)</p>
                  <p className="text-xs font-bold text-center truncate">{Math.max(physicalRemaining, 0).toLocaleString()} د.ج</p>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="text-center">
                      <Banknote className="w-3 h-3 mx-auto text-muted-foreground" />
                      <p className="text-[9px] text-muted-foreground">ورقي</p>
                      <p className="text-[10px] font-bold truncate">{Math.max(paperMoney, 0).toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <Coins className="w-3 h-3 mx-auto text-amber-500" />
                      <p className="text-[9px] text-muted-foreground">معدني</p>
                      <p className="text-[10px] font-bold text-amber-500 truncate">{(summary?.coins || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                {/* القسم 2: غير مستلم مادياً */}
                <div className="rounded-lg bg-muted/50 p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground text-center">🏦 غير مستلم مادياً</p>
                  <p className="text-xs font-bold text-center truncate">{nonCash.toLocaleString()} د.ج</p>
                  <p className="text-[9px] text-muted-foreground text-center">(شيكات + فيرسمو + فيرمو)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

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

export default ManagerTreasury;
