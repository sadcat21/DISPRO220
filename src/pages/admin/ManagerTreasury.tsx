import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTreasurySummary, useManagerTreasury, useManagerHandovers, useCreateHandover, useAddTreasuryEntry } from '@/hooks/useManagerTreasury';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Banknote, CreditCard, Receipt, ArrowUpRight, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const paymentMethodLabels: Record<string, { ar: string; icon: any }> = {
  cash: { ar: 'نقدي', icon: Banknote },
  check: { ar: 'شيك', icon: CreditCard },
  bank_receipt: { ar: 'وصل تحويل بنكي', icon: Receipt },
  bank_transfer: { ar: 'تحويل بنكي مباشر', icon: ArrowUpRight },
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
  const [addForm, setAddForm] = useState({ payment_method: 'cash', amount: '', check_number: '', check_bank: '', receipt_number: '', transfer_reference: '', notes: '' });
  const [handoverForm, setHandoverForm] = useState({ payment_method: 'cash', amount: '', check_count: '', receipt_count: '', notes: '' });

  const handleAddEntry = async () => {
    if (!addForm.amount || Number(addForm.amount) <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    try {
      await addEntry.mutateAsync({
        payment_method: addForm.payment_method,
        amount: Number(addForm.amount),
        check_number: addForm.check_number || undefined,
        check_bank: addForm.check_bank || undefined,
        receipt_number: addForm.receipt_number || undefined,
        transfer_reference: addForm.transfer_reference || undefined,
        notes: addForm.notes || undefined,
      });
      toast.success('تم إضافة المبلغ بنجاح');
      setAddOpen(false);
      setAddForm({ payment_method: 'cash', amount: '', check_number: '', check_bank: '', receipt_number: '', transfer_reference: '', notes: '' });
    } catch {
      toast.error('حدث خطأ');
    }
  };

  const handleHandover = async () => {
    if (!handoverForm.amount || Number(handoverForm.amount) <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    try {
      await createHandover.mutateAsync({
        payment_method: handoverForm.payment_method,
        amount: Number(handoverForm.amount),
        check_count: Number(handoverForm.check_count) || 0,
        receipt_count: Number(handoverForm.receipt_count) || 0,
        notes: handoverForm.notes || undefined,
      });
      toast.success('تم تسجيل التسليم بنجاح');
      setHandoverOpen(false);
      setHandoverForm({ payment_method: 'cash', amount: '', check_count: '', receipt_count: '', notes: '' });
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
                <div>
                  <Label>طريقة الدفع</Label>
                  <Select value={addForm.payment_method} onValueChange={v => setAddForm(f => ({ ...f, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(paymentMethodLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.ar}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المبلغ</Label>
                  <Input type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                {addForm.payment_method === 'check' && (
                  <>
                    <div><Label>رقم الشيك</Label><Input value={addForm.check_number} onChange={e => setAddForm(f => ({ ...f, check_number: e.target.value }))} /></div>
                    <div><Label>البنك</Label><Input value={addForm.check_bank} onChange={e => setAddForm(f => ({ ...f, check_bank: e.target.value }))} /></div>
                  </>
                )}
                {addForm.payment_method === 'bank_receipt' && (
                  <div><Label>رقم الوصل</Label><Input value={addForm.receipt_number} onChange={e => setAddForm(f => ({ ...f, receipt_number: e.target.value }))} /></div>
                )}
                {addForm.payment_method === 'bank_transfer' && (
                  <div><Label>مرجع التحويل</Label><Input value={addForm.transfer_reference} onChange={e => setAddForm(f => ({ ...f, transfer_reference: e.target.value }))} /></div>
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
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>تسليم أموال</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>طريقة الدفع</Label>
                  <Select value={handoverForm.payment_method} onValueChange={v => setHandoverForm(f => ({ ...f, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(paymentMethodLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.ar}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>المبلغ</Label><Input type="number" value={handoverForm.amount} onChange={e => setHandoverForm(f => ({ ...f, amount: e.target.value }))} /></div>
                {handoverForm.payment_method === 'check' && (
                  <div><Label>عدد الشيكات</Label><Input type="number" value={handoverForm.check_count} onChange={e => setHandoverForm(f => ({ ...f, check_count: e.target.value }))} /></div>
                )}
                {handoverForm.payment_method === 'bank_receipt' && (
                  <div><Label>عدد الوصولات</Label><Input type="number" value={handoverForm.receipt_count} onChange={e => setHandoverForm(f => ({ ...f, receipt_count: e.target.value }))} /></div>
                )}
                <div><Label>ملاحظات</Label><Textarea value={handoverForm.notes} onChange={e => setHandoverForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleHandover} disabled={createHandover.isPending} className="w-full">تسجيل التسليم</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-3 text-center">
            <Banknote className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <p className="text-xs text-muted-foreground">نقدي</p>
            <p className="text-lg font-bold text-green-500">{summary?.cash?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-3 text-center">
            <CreditCard className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xs text-muted-foreground">شيكات ({summary?.checkCount || 0})</p>
            <p className="text-lg font-bold text-blue-500">{summary?.check?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="p-3 text-center">
            <Receipt className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-xs text-muted-foreground">وصولات ({summary?.receiptCount || 0})</p>
            <p className="text-lg font-bold text-purple-500">{summary?.bank_receipt?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-3 text-center">
            <ArrowUpRight className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className="text-xs text-muted-foreground">تحويلات بنكية</p>
            <p className="text-lg font-bold text-orange-500">{summary?.bank_transfer?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
      </div>

      {/* Total & Remaining */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">الإجمالي</p>
            <p className="text-lg font-bold">{summary?.total?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">المُسلَّم</p>
            <p className="text-lg font-bold text-red-500">{summary?.handedOver?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">المتبقي</p>
            <p className="text-lg font-bold text-primary">{summary?.remaining?.toLocaleString() || 0} د.ج</p>
          </CardContent>
        </Card>
      </div>

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
            const method = paymentMethodLabels[h.payment_method];
            return (
              <Card key={h.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <Send className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <p className="font-medium">{Number(h.amount).toLocaleString()} د.ج</p>
                      <p className="text-xs text-muted-foreground">
                        {method?.ar || h.payment_method}
                        {h.check_count > 0 && ` - ${h.check_count} شيكات`}
                        {h.receipt_count > 0 && ` - ${h.receipt_count} وصولات`}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(h.created_at), 'dd/MM/yyyy', { locale: ar })}
                    </p>
                    {h.notes && <p className="text-xs text-muted-foreground">{h.notes}</p>}
                  </div>
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
