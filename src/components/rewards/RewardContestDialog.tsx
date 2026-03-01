import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundBalance: number;
  currentFundId?: string;
  workers: { id: string; full_name: string }[];
}

const RewardContestDialog: React.FC<Props> = ({ open, onOpenChange, fundBalance, currentFundId, workers }) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'contest' | 'bonus'>('bonus');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (amt <= 0 || amt > fundBalance) {
      toast.error('المبلغ غير صالح أو يتجاوز رصيد الصندوق');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'bonus' && selectedWorker) {
        // Grant special bonus from fund
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('employee_points_log').insert({
          worker_id: selectedWorker,
          points: 0,
          point_type: 'reward',
          point_date: today,
          source_entity: 'contest',
          notes: `مكافأة استثنائية من الصندوق: ${notes || ''} (${amt} DA)`,
        });
      }

      // Update fund used_amount
      if (currentFundId) {
        const { data: fund } = await supabase.from('reward_reserve_fund').select('used_amount').eq('id', currentFundId).single();
        const newUsed = (Number(fund?.used_amount) || 0) + amt;
        await supabase.from('reward_reserve_fund').update({ 
          used_amount: newUsed, 
          notes: `${notes || 'مكافأة استثنائية'} - ${amt} DA` 
        }).eq('id', currentFundId);
      }

      queryClient.invalidateQueries({ queryKey: ['reward-reserve-fund'] });
      toast.success('تم صرف المكافأة من الصندوق بنجاح');
      onOpenChange(false);
      setAmount('');
      setNotes('');
      setSelectedWorker('');
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-600" />
            مكافأة استثنائية من الصندوق
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
            <p className="text-xs text-muted-foreground">رصيد الصندوق المتاح</p>
            <p className="text-xl font-bold text-emerald-600">{fundBalance.toLocaleString()} DA</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">النوع</Label>
            <Select value={mode} onValueChange={(v: 'contest' | 'bonus') => setMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bonus">مكافأة فردية لموظف</SelectItem>
                <SelectItem value="contest">مسابقة جماعية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'bonus' && (
            <div className="space-y-2">
              <Label className="text-xs">الموظف</Label>
              <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                <SelectContent>
                  {workers.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">المبلغ (DA)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">ملاحظات / سبب المكافأة</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="مكافأة على الأداء المتميز..." rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={loading || !amount} className="w-full">
            {loading ? 'جاري التنفيذ...' : 'صرف المكافأة'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RewardContestDialog;
