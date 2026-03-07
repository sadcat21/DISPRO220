import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, CalendarPlus, Check, Package, Phone, User } from 'lucide-react';
import { usePromoSplits, PromoSplitWithDetails, PromoSplitInstallment } from '@/hooks/usePromoSplits';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  split: PromoSplitWithDetails;
}

const PromoSplitDetailsDialog: React.FC<Props> = ({ open, onOpenChange, split }) => {
  const { addCustomer, updateCustomer, removeCustomer, addInstallment, updateInstallment, fetchInstallments, fetchSplits } = usePromoSplits();
  
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [allocatedQty, setAllocatedQty] = useState('');
  const [giftShare, setGiftShare] = useState('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Record<string, PromoSplitInstallment[]>>({});
  const [newInstDate, setNewInstDate] = useState('');
  const [newInstQty, setNewInstQty] = useState('');
  const [addingInstFor, setAddingInstFor] = useState<string | null>(null);

  const { data: customers } = useQuery({
    queryKey: ['customers-for-split'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name, phone, sector_id').eq('status', 'active').order('name');
      return data || [];
    },
    enabled: open,
  });

  const existingCustomerIds = split.customers?.map(c => c.customer_id) || [];

  const loadInstallments = async (splitCustomerId: string) => {
    try {
      const data = await fetchInstallments(splitCustomerId);
      setInstallments(prev => ({ ...prev, [splitCustomerId]: data }));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (open && split.customers) {
      split.customers.forEach(c => loadInstallments(c.id));
    }
  }, [open, split.customers?.length]);

  const handleAddCustomer = async () => {
    if (!selectedCustomerId || !allocatedQty) return;
    const effectiveGift = split.adjusted_gift_quantity ?? split.gift_quantity;
    const share = giftShare ? Number(giftShare) : (Number(allocatedQty) / Number(split.target_quantity)) * Number(effectiveGift);
    
    await addCustomer({
      split_id: split.id,
      customer_id: selectedCustomerId,
      allocated_quantity: Number(allocatedQty),
      gift_share: Math.round(share * 100) / 100,
    });
    setShowAddCustomer(false);
    setSelectedCustomerId('');
    setAllocatedQty('');
    setGiftShare('');
  };

  const handleUpdateDelivered = async (customerId: string, value: string) => {
    await updateCustomer(customerId, { delivered_quantity: Number(value) });
  };

  const handleToggleGiftDelivered = async (customerId: string, current: boolean) => {
    await updateCustomer(customerId, { gift_delivered: !current });
  };

  const handleAddInstallment = async (splitCustomerId: string) => {
    if (!newInstDate || !newInstQty) return;
    await addInstallment({
      split_customer_id: splitCustomerId,
      scheduled_date: newInstDate,
      planned_quantity: Number(newInstQty),
    });
    await loadInstallments(splitCustomerId);
    setNewInstDate('');
    setNewInstQty('');
    setAddingInstFor(null);
  };

  const handleUpdateInstallmentStatus = async (instId: string, splitCustomerId: string, status: string, actual: number) => {
    await updateInstallment(instId, { status, actual_quantity: actual });
    await loadInstallments(splitCustomerId);
  };

  const totalDelivered = split.customers?.reduce((s, c) => s + Number(c.delivered_quantity || 0), 0) || 0;
  const effectiveGift = split.adjusted_gift_quantity ?? split.gift_quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {split.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted rounded-lg p-2">
              <div className="text-lg font-bold">{totalDelivered}/{Number(split.target_quantity)}</div>
              <div className="text-[10px] text-muted-foreground">الكمية المسلمة</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="text-lg font-bold">{split.customers?.length || 0}</div>
              <div className="text-[10px] text-muted-foreground">عملاء</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="text-lg font-bold">{Number(effectiveGift)}</div>
              <div className="text-[10px] text-muted-foreground">عرض {split.gift_quantity_unit === 'box' ? 'صندوق' : 'قطعة'}</div>
            </div>
          </div>

          {/* Customers List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">العملاء</h3>
              <Button size="sm" variant="outline" onClick={() => setShowAddCustomer(!showAddCustomer)}>
                <Plus className="w-3 h-3 mr-1" />
                إضافة عميل
              </Button>
            </div>

            {/* Add Customer Form */}
            {showAddCustomer && (
              <Card>
                <CardContent className="p-3 space-y-2">
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger><SelectValue placeholder="اختر عميل..." /></SelectTrigger>
                    <SelectContent>
                      {customers?.filter(c => !existingCustomerIds.includes(c.id)).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `- ${c.phone}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">الكمية المخصصة</Label>
                      <Input type="number" value={allocatedQty} onChange={e => setAllocatedQty(e.target.value)} placeholder="200" />
                    </div>
                    <div>
                      <Label className="text-xs">حصة العرض (تلقائي)</Label>
                      <Input type="number" value={giftShare} onChange={e => setGiftShare(e.target.value)} placeholder="تلقائي" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={handleAddCustomer} disabled={!selectedCustomerId || !allocatedQty}>
                      إضافة
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddCustomer(false)}>إلغاء</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Customer Cards */}
            {split.customers?.map(sc => {
              const cust = sc.customer;
              const custInstallments = installments[sc.id] || [];
              const isExpanded = expandedCustomer === sc.id;

              return (
                <Card key={sc.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="font-medium text-sm">{cust?.name || 'عميل محذوف'}</span>
                        </div>
                        {cust?.phone && (
                          <a href={`tel:${cust.phone}`} className="flex items-center gap-1 text-xs text-primary mt-0.5">
                            <Phone className="w-3 h-3" />
                            {cust.phone}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={sc.gift_delivered ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleToggleGiftDelivered(sc.id, sc.gift_delivered)}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          عرض {sc.gift_delivered ? '✓' : ''}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCustomer(sc.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Quantities */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">مخصص:</span>
                        <span className="font-medium mr-1">{Number(sc.allocated_quantity)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">مسلم:</span>
                        <Input
                          type="number"
                          className="h-6 w-16 text-xs px-1"
                          value={sc.delivered_quantity}
                          onChange={e => handleUpdateDelivered(sc.id, e.target.value)}
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground">حصة العرض:</span>
                        <span className="font-medium mr-1">{Number(sc.gift_share)}</span>
                      </div>
                    </div>

                    {/* Installments Toggle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs h-7"
                      onClick={() => setExpandedCustomer(isExpanded ? null : sc.id)}
                    >
                      <CalendarPlus className="w-3 h-3 mr-1" />
                      جدولة الدفعات ({custInstallments.length})
                    </Button>

                    {isExpanded && (
                      <div className="space-y-2 border-t pt-2">
                        {custInstallments.map(inst => (
                          <div key={inst.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                            <span>{format(new Date(inst.scheduled_date), 'yyyy-MM-dd')}</span>
                            <span>مخطط: {Number(inst.planned_quantity)}</span>
                            <span>فعلي: {Number(inst.actual_quantity)}</span>
                            <Badge variant={inst.status === 'completed' ? 'default' : inst.status === 'missed' ? 'destructive' : 'outline'} className="text-[9px]">
                              {inst.status === 'completed' ? 'مكتمل' : inst.status === 'missed' ? 'فائت' : inst.status === 'partial' ? 'جزئي' : 'معلق'}
                            </Badge>
                            <div className="flex gap-1 mr-auto">
                              <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1" onClick={() => handleUpdateInstallmentStatus(inst.id, sc.id, 'completed', Number(inst.planned_quantity))}>✓</Button>
                              <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1" onClick={() => handleUpdateInstallmentStatus(inst.id, sc.id, 'missed', 0)}>✗</Button>
                            </div>
                          </div>
                        ))}

                        {/* Add installment */}
                        {addingInstFor === sc.id ? (
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-[10px]">التاريخ</Label>
                              <Input type="date" className="h-7 text-xs" value={newInstDate} onChange={e => setNewInstDate(e.target.value)} />
                            </div>
                            <div className="w-20">
                              <Label className="text-[10px]">الكمية</Label>
                              <Input type="number" className="h-7 text-xs" value={newInstQty} onChange={e => setNewInstQty(e.target.value)} />
                            </div>
                            <Button size="sm" className="h-7" onClick={() => handleAddInstallment(sc.id)}>+</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setAddingInstFor(sc.id)}>
                            <Plus className="w-3 h-3 mr-1" />
                            إضافة دفعة
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromoSplitDetailsDialog;
