import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedName } from '@/utils/sectorName';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Check, X, Loader2, User, Clock, AlertCircle, Phone, MapPin, Building2, Store, CreditCard, Shield, UserCircle, Save, Languages, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateDebt, useUpdateDebtPayment } from '@/hooks/useCustomerDebts';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { ALGERIAN_WILAYAS } from '@/data/algerianWilayas';
import { useSectors } from '@/hooks/useSectors';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';

interface ApprovalRequest {
    id: string;
    operation_type: string;
    customer_id: string | null;
    payload: any;
    requested_by: string;
    branch_id: string | null;
    status: string;
    created_at: string;
    requester_name?: string;
}

interface SectorZone {
    id: string;
    name: string;
    sector_id: string;
}

const CustomerApprovalTab: React.FC = () => {
    const { workerId, role, activeBranch } = useAuth();
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const createDebt = useCreateDebt();
    const updateDebtPayment = useUpdateDebtPayment();
    const { trackVisit } = useTrackVisit();
    const { sectors } = useSectors();
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Review dialog state
    const [reviewRequest, setReviewRequest] = useState<ApprovalRequest | null>(null);
    const [editPayload, setEditPayload] = useState<any>({});
    const [zones, setZones] = useState<SectorZone[]>([]);
    const [showMap, setShowMap] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [phones, setPhones] = useState<string[]>(['']);
    const [salesReps, setSalesReps] = useState<{name: string; phone: string}[]>([{name: '', phone: ''}]);
    const [addingZone, setAddingZone] = useState(false);
    const [newZoneName, setNewZoneName] = useState('');
    const [savingZone, setSavingZone] = useState(false);

    useEffect(() => {
        fetchRequests();
    }, [activeBranch]);

    const fetchZones = useCallback((sectorId: string) => {
        supabase.from('sector_zones').select('id, name, sector_id')
            .eq('sector_id', sectorId).order('name')
            .then(({ data }) => setZones(data || []));
    }, []);

    // Fetch zones when sector changes
    useEffect(() => {
        setAddingZone(false);
        if (!editPayload.sector_id) {
            setZones([]);
            return;
        }
        fetchZones(editPayload.sector_id);
    }, [editPayload.sector_id, fetchZones]);

    const handleAddZoneApproval = async () => {
        if (!newZoneName.trim() || !editPayload.sector_id) return;
        setSavingZone(true);
        try {
            const { data, error } = await supabase.from('sector_zones').insert({ name: newZoneName.trim(), sector_id: editPayload.sector_id }).select().single();
            if (error) throw error;
            toast.success(`تمت إضافة المنطقة: ${newZoneName.trim()}`);
            setNewZoneName('');
            setAddingZone(false);
            fetchZones(editPayload.sector_id);
            if (data) setEditPayload((p: any) => ({ ...p, zone_id: data.id }));
        } catch (err: any) {
            toast.error('فشل في إضافة المنطقة: ' + err.message);
        } finally {
            setSavingZone(false);
        }
    };

    const autoApproveInsertRequests = async (requests: any[]) => {
        const insertRequests = requests.filter((r: any) => r.operation_type === 'insert');
        for (const req of insertRequests) {
            try {
                const payload = req.payload;
                const { debtAmount, initial_debt, ...customerData } = payload;
                const finalDebtAmount = debtAmount || initial_debt || 0;
                const { data: newCustomer, error: insertError } = await supabase
                    .from('customers').insert(customerData).select().single();
                if (insertError) throw insertError;

                if (finalDebtAmount > 0 && workerId) {
                    await createDebt.mutateAsync({
                        customer_id: newCustomer.id,
                        worker_id: req.requested_by,
                        branch_id: req.branch_id || undefined,
                        total_amount: finalDebtAmount,
                        paid_amount: 0,
                        notes: 'دين أولي عند إنشاء العميل (موافقة تلقائية)',
                    });
                }

                await supabase
                    .from('customer_approval_requests')
                    .update({ status: 'approved', reviewed_by: workerId, reviewed_at: new Date().toISOString() })
                    .eq('id', req.id);

                trackVisit({ customerId: newCustomer.id, operationType: 'add_customer', operationId: newCustomer.id });
                toast.success(`تمت الموافقة التلقائية على إضافة: ${payload.store_name || payload.name}`);
            } catch (err: any) {
                console.error('Auto-approve insert failed:', err);
            }
        }
        return requests.filter((r: any) => r.operation_type !== 'insert');
    };

    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('customer_approval_requests')
                .select(`*, workers!requested_by(full_name)`)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (role === 'branch_admin' && activeBranch) {
                query = query.eq('branch_id', activeBranch.id);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Auto-approve any pending insert requests
            const allRequests = (data || []).map((r: any) => ({
                ...r,
                requester_name: r.workers?.full_name
            }));
            const remaining = await autoApproveInsertRequests(allRequests);
            setRequests(remaining);
            if (remaining.length < allRequests.length) {
                queryClient.invalidateQueries({ queryKey: ['customers'] });
                queryClient.invalidateQueries({ queryKey: ['worker-request-summaries'] });
            }
        } catch (error: any) {
            console.error('Error fetching approval requests:', error);
            toast.error('خطأ في جلب طلبات الموافقة');
        } finally {
            setIsLoading(false);
        }
    };

    const openReviewDialog = (request: ApprovalRequest) => {
        setReviewRequest(request);
        const payload = { ...request.payload };
        setEditPayload(payload);
        // Parse phones
        const phoneList = payload.phone ? payload.phone.split(/\s*\/\s*/).filter(Boolean) : [''];
        setPhones(phoneList.length > 0 ? phoneList : ['']);
        // Parse sales reps
        const repNames = payload.sales_rep_name ? payload.sales_rep_name.split(/\s*\/\s*/).filter(Boolean) : [];
        const repPhones = payload.sales_rep_phone ? payload.sales_rep_phone.split(/\s*\/\s*/).filter(Boolean) : [];
        const reps: {name: string; phone: string}[] = [];
        const maxLen = Math.max(repNames.length, repPhones.length, 1);
        for (let i = 0; i < maxLen; i++) {
            reps.push({ name: repNames[i] || '', phone: repPhones[i] || '' });
        }
        setSalesReps(reps);
        setShowMap(!!(payload.latitude && payload.longitude));
        setShowAdvanced(false);
    };

    const handleApproveWithEdits = async (applyEdits: boolean) => {
        if (!reviewRequest) return;
        setProcessingId(reviewRequest.id);
        try {
            const payload = applyEdits ? {
                ...editPayload,
                phone: phones.filter(p => p.trim()).join(' / ') || null,
                sales_rep_name: salesReps.filter(r => r.name.trim()).map(r => r.name.trim()).join(' / ') || null,
                sales_rep_phone: salesReps.filter(r => r.phone.trim()).map(r => r.phone.trim()).join(' / ') || null,
            } : reviewRequest.payload;

            if (reviewRequest.operation_type === 'insert') {
                const { debtAmount, initial_debt, ...customerData } = payload;
                const finalDebtAmount = debtAmount || initial_debt || 0;
                const { data: newCustomer, error: insertError } = await supabase
                    .from('customers').insert(customerData).select().single();

                if (insertError) throw insertError;

                if (finalDebtAmount > 0 && workerId) {
                    await createDebt.mutateAsync({
                        customer_id: newCustomer.id,
                        worker_id: reviewRequest.requested_by,
                        branch_id: reviewRequest.branch_id || undefined,
                        total_amount: finalDebtAmount,
                        paid_amount: 0,
                        notes: 'دين أولي عند إنشاء العميل (عبر نظام الموافقة)',
                    });
                }

                trackVisit({ customerId: newCustomer.id, operationType: 'add_customer', operationId: newCustomer.id });
                toast.success(applyEdits ? 'تمت الموافقة مع حفظ التعديلات' : 'تمت الموافقة وإضافة العميل بنجاح');
            }
            else if (reviewRequest.operation_type === 'update' && reviewRequest.customer_id) {
                const { debtAmount, initial_debt: _id, new_debt_amount, ...updateData } = payload;
                const { error: updateError } = await supabase
                    .from('customers').update(updateData).eq('id', reviewRequest.customer_id);
                if (updateError) throw updateError;
                toast.success(applyEdits ? 'تمت الموافقة مع حفظ التعديلات' : 'تمت الموافقة وتعديل العميل بنجاح');
            }
            else if (reviewRequest.operation_type === 'delete' && reviewRequest.customer_id) {
                const { error: deleteError } = await supabase
                    .from('customers').delete().eq('id', reviewRequest.customer_id);
                if (deleteError) throw deleteError;
                toast.success('تمت الموافقة وحذف العميل بنجاح');
            }

            const { error: statusError } = await supabase
                .from('customer_approval_requests')
                .update({ status: 'approved', reviewed_by: workerId, reviewed_at: new Date().toISOString() })
                .eq('id', reviewRequest.id);
            if (statusError) throw statusError;

            setReviewRequest(null);
            fetchRequests();
            // Real-time invalidation
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['customer-approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['worker-request-summaries'] });
        } catch (error: any) {
            console.error('Error approving request:', error);
            toast.error('فشل في تنفيذ الموافقة: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            const { error } = await supabase
                .from('customer_approval_requests')
                .update({ status: 'rejected', reviewed_by: workerId, reviewed_at: new Date().toISOString() })
                .eq('id', requestId);
            if (error) throw error;
            toast.info('تم رفض الطلب');
            setReviewRequest(null);
            fetchRequests();
            queryClient.invalidateQueries({ queryKey: ['worker-request-summaries'] });
        } catch (error: any) {
            toast.error('فشل في رفض الطلب');
        } finally {
            setProcessingId(null);
        }
    };

    // Phone helpers
    const addPhone = () => setPhones(prev => [...prev, '']);
    const removePhone = (idx: number) => setPhones(prev => prev.filter((_, i) => i !== idx));
    const updatePhone = (idx: number, val: string) => setPhones(prev => prev.map((p, i) => i === idx ? val : p));

    // Sales rep helpers
    const addSalesRep = () => setSalesReps(prev => [...prev, { name: '', phone: '' }]);
    const removeSalesRep = (idx: number) => setSalesReps(prev => prev.filter((_, i) => i !== idx));

    // Completion percentage
    const completionPercent = React.useMemo(() => {
        const required = [!!editPayload.name?.trim(), !!phones[0]?.trim(), !!editPayload.store_name?.trim()];
        const optional = [!!editPayload.address?.trim(), !!editPayload.wilaya, !!editPayload.sector_id, !!(editPayload.latitude && editPayload.longitude)];
        const total = required.length + optional.length;
        const filled = [...required, ...optional].filter(Boolean).length;
        return Math.round((filled / total) * 100);
    }, [editPayload, phones]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {requests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-secondary/20 rounded-lg border-2 border-dashed">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>لا توجد طلبات موافقة معلقة حالياً</p>
                </div>
            ) : (
                requests.map((request) => (
                    <Card key={request.id} className="overflow-hidden border-primary/20">
                        <div className={`h-1 w-full ${request.operation_type === 'insert' ? 'bg-green-500' : request.operation_type === 'update' ? 'bg-blue-500' : 'bg-red-500'}`} />
                        <CardContent className="p-4">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={request.operation_type === 'insert' ? 'secondary' : request.operation_type === 'update' ? 'outline' : 'destructive'}>
                                            {request.operation_type === 'insert' ? 'إضافة عميل جديد' : request.operation_type === 'update' ? 'تعديل زبون قائم' : 'حذف زبون'}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(request.created_at).toLocaleString('ar-DZ')}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <Store className="w-5 h-5 text-primary" />
                                        {request.payload.store_name || request.payload.name || request.payload.customerName}
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        {request.payload.phone && (
                                            <div className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /><span dir="ltr">{request.payload.phone}</span></div>
                                        )}
                                        {request.payload.wilaya && (
                                            <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /><span>{request.payload.wilaya}</span></div>
                                        )}
                                        {request.payload.store_name && (
                                            <div className="flex items-center gap-1"><Store className="w-3.5 h-3.5" /><span>{request.payload.store_name}</span></div>
                                        )}
                                        <div className="flex items-center gap-1 col-span-full mt-2 pt-2 border-t">
                                            <UserCircle className="w-3.5 h-3.5 text-primary" />
                                            <span>المقدم بواسطة: </span>
                                            <span className="font-medium text-foreground">{request.requester_name}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-row md:flex-col gap-2 justify-end">
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => openReviewDialog(request)} disabled={!!processingId}>
                                        <Check className="w-4 h-4" />
                                        معاينة
                                    </Button>
                                    <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleReject(request.id)} disabled={!!processingId}>
                                        {processingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        رفض
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}

            {/* Review/Edit Dialog - Full Form matching EditCustomerDialog */}
            <Dialog open={!!reviewRequest} onOpenChange={(open) => !open && setReviewRequest(null)}>
                <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir="rtl">
                    <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
                        <DialogTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-primary" />
                            {reviewRequest?.operation_type === 'delete' ? 'تأكيد حذف العميل' : 'مراجعة بيانات العميل'}
                        </DialogTitle>
                    </DialogHeader>

                    <ScrollArea className="max-h-[calc(90vh-6rem)]">
                        {reviewRequest && reviewRequest.operation_type === 'delete' ? (
                            <div className="space-y-4 p-4">
                                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                                    <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                                    <p className="font-bold text-lg">{reviewRequest.payload.name || reviewRequest.payload.customerName}</p>
                                    <p className="text-sm text-muted-foreground mt-1">هل أنت متأكد من حذف هذا العميل؟</p>
                                </div>
                                <DialogFooter className="gap-2">
                                    <Button variant="outline" onClick={() => setReviewRequest(null)}>إلغاء</Button>
                                    <Button variant="destructive" onClick={() => handleApproveWithEdits(false)} disabled={!!processingId}>
                                        {processingId ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                                        تأكيد الحذف
                                    </Button>
                                </DialogFooter>
                            </div>
                        ) : reviewRequest ? (
                            <div className="p-4 space-y-4">
                                {/* Completion Bar */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-muted-foreground">اكتمال البيانات</span>
                                        <span className="text-xs font-semibold text-primary">{completionPercent}%</span>
                                    </div>
                                    <Progress value={completionPercent} className="h-2" />
                                </div>

                                {/* === Section 1: Basic Info === */}
                                <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
                                    <Label className="font-bold flex items-center gap-2 text-sm text-primary">
                                        <User className="w-4 h-4" />
                                        المعلومات الأساسية
                                    </Label>
                                    <div className="space-y-2">
                                        <Label className="text-xs">اسم العميل *</Label>
                                        <Input value={editPayload.name || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, name: e.target.value }))} className="text-right" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs flex items-center gap-1"><Languages className="w-3.5 h-3.5" />اسم العميل بالفرنسية</Label>
                                        <Input value={editPayload.name_fr || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, name_fr: e.target.value }))} className="text-left" dir="ltr" placeholder="Nom du client" />
                                    </div>

                                    {/* Phone numbers */}
                                    <div className="space-y-2">
                                        <Label className="text-xs">هاتف العميل *</Label>
                                        {phones.map((ph, idx) => (
                                            <div key={idx} className="flex gap-1.5">
                                                <Input type="tel" value={ph} onChange={(e) => updatePhone(idx, e.target.value)} placeholder={`هاتف ${idx + 1}`} className="text-right flex-1" dir="ltr" />
                                                {idx > 0 && (
                                                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive shrink-0" onClick={() => removePhone(idx)}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={addPhone}>
                                            <Plus className="w-3 h-3 ml-1" /> إضافة رقم هاتف آخر
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs">اسم المحل</Label>
                                        <Input value={editPayload.store_name || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, store_name: e.target.value }))} className="text-right" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs flex items-center gap-1"><Languages className="w-3.5 h-3.5" />اسم المحل بالفرنسية</Label>
                                        <Input value={editPayload.store_name_fr || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, store_name_fr: e.target.value }))} className="text-left" dir="ltr" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs flex items-center gap-1"><UserCircle className="w-3.5 h-3.5" />الاسم الداخلي</Label>
                                        <Input value={editPayload.internal_name || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, internal_name: e.target.value }))} placeholder="اسم مختصر للفريق" className="text-right" />
                                    </div>
                                </div>

                                {/* === Section 2: Location === */}
                                <div className="space-y-3 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                                    <Label className="font-bold flex items-center gap-2 text-sm text-blue-600">
                                        <MapPin className="w-4 h-4" />
                                        الموقع والعنوان
                                    </Label>
                                    <div className="space-y-2">
                                        <Label className="text-xs">الولاية</Label>
                                        <Select value={editPayload.wilaya || ''} onValueChange={(v) => setEditPayload((p: any) => ({ ...p, wilaya: v }))}>
                                            <SelectTrigger><SelectValue placeholder="اختر الولاية" /></SelectTrigger>
                                            <SelectContent className="max-h-60 bg-popover z-[10050]">
                                                {ALGERIAN_WILAYAS.map((w) => (
                                                    <SelectItem key={w.code} value={w.name}>{w.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">العنوان</Label>
                                        <Input value={editPayload.address || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, address: e.target.value }))} className="text-right" />
                                    </div>
                                    {sectors.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-xs">السكتور</Label>
                                            <Select value={editPayload.sector_id || 'none'} onValueChange={(v) => setEditPayload((p: any) => ({ ...p, sector_id: v === 'none' ? null : v }))}>
                                                <SelectTrigger><SelectValue placeholder="اختر السكتور" /></SelectTrigger>
                                                <SelectContent className="bg-popover z-[10050]">
                                                    <SelectItem value="none">بدون سكتور</SelectItem>
                                                    {sectors.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{getLocalizedName(s, language)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {editPayload.sector_id && (
                                        <div className="space-y-2">
                                            <Label className="text-xs">المنطقة داخل السكتور</Label>
                                            {addingZone ? (
                                                <div className="flex gap-2" dir="rtl">
                                                    <Input value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="اسم المنطقة الجديدة" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAddZoneApproval()} />
                                                    <Button size="sm" onClick={handleAddZoneApproval} disabled={savingZone || !newZoneName.trim()}>
                                                        {savingZone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => { setAddingZone(false); setNewZoneName(''); }}>
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Select value={editPayload.zone_id || 'none'} onValueChange={(v) => {
                                                    if (v === '__add_new') { setAddingZone(true); return; }
                                                    setEditPayload((p: any) => ({ ...p, zone_id: v === 'none' ? null : v }));
                                                }}>
                                                    <SelectTrigger><SelectValue placeholder="اختر المنطقة" /></SelectTrigger>
                                                    <SelectContent className="bg-popover z-[10050]">
                                                        <SelectItem value="none">بدون تحديد</SelectItem>
                                                        {zones.map(z => (
                                                            <SelectItem key={z.id} value={z.id}>{getLocalizedName(z, language)}</SelectItem>
                                                        ))}
                                                        <SelectItem value="__add_new" className="text-primary font-semibold">
                                                            إضافة منطقة لـ <span className="text-foreground">{sectors.find(s => s.id === editPayload.sector_id)?.name || 'السكتور'}</span>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                    )}

                                    {/* GPS Location */}
                                    {(editPayload.latitude && editPayload.longitude) && (
                                        <div className="text-xs text-muted-foreground bg-secondary/50 px-3 py-2 rounded-lg flex items-center gap-2">
                                            <MapPin className="w-3 h-3 text-primary" />
                                            <span dir="ltr">{editPayload.latitude?.toFixed(6)}, {editPayload.longitude?.toFixed(6)}</span>
                                        </div>
                                    )}
                                    <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowMap(!showMap)}>
                                        <MapPin className="w-3 h-3 ml-1" />
                                        {showMap ? 'إخفاء الخريطة' : 'تحديد الموقع على الخريطة'}
                                    </Button>
                                    {showMap && (
                                        <div className="h-48 rounded-lg overflow-hidden border">
                                            <LazyLocationPicker
                                                latitude={editPayload.latitude || 36.7}
                                                longitude={editPayload.longitude || 3.08}
                                                onLocationChange={(lat, lng) => setEditPayload((p: any) => ({ ...p, latitude: lat, longitude: lng }))}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* === Section 3: Payment & Advanced === */}
                                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                                    <CollapsibleTrigger asChild>
                                        <Button type="button" variant="outline" className="w-full text-xs gap-2">
                                            <CreditCard className="w-3.5 h-3.5" />
                                            إعدادات الدفع والتسعير
                                            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="space-y-3 mt-3 rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs">نوع الدفع الافتراضي</Label>
                                            <Select value={editPayload.default_payment_type || 'without_invoice'} onValueChange={(v) => setEditPayload((p: any) => ({ ...p, default_payment_type: v }))}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent className="bg-popover z-[10050]">
                                                     <SelectItem value="with_invoice">Facture 1 (بفاتورة)</SelectItem>
                                                     <SelectItem value="without_invoice">Facture 2 (بدون فاتورة)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">فئة التسعير الافتراضية</Label>
                                            <Select value={editPayload.default_price_subtype || 'gros'} onValueChange={(v) => setEditPayload((p: any) => ({ ...p, default_price_subtype: v }))}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent className="bg-popover z-[10050]">
                                                     <SelectItem value="super_gros">Super Gros</SelectItem>
                                                     <SelectItem value="gros">Gros</SelectItem>
                                                     <SelectItem value="retail">Détail</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs flex items-center gap-1"><Shield className="w-3.5 h-3.5" />عميل موثوق</Label>
                                            <Switch checked={editPayload.is_trusted || false} onCheckedChange={(v) => setEditPayload((p: any) => ({ ...p, is_trusted: v }))} />
                                        </div>
                                        {editPayload.is_trusted && (
                                            <div className="space-y-2">
                                                <Label className="text-xs">ملاحظات الثقة</Label>
                                                <Input value={editPayload.trust_notes || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, trust_notes: e.target.value }))} className="text-right" />
                                            </div>
                                        )}

                                        {/* Sales Reps */}
                                        <div className="space-y-2 border-t pt-2">
                                            <Label className="text-xs font-semibold">مندوب المبيعات</Label>
                                            {salesReps.map((rep, idx) => (
                                                <div key={idx} className="flex gap-1.5">
                                                    <Input value={rep.name} onChange={(e) => setSalesReps(prev => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} placeholder="اسم المندوب" className="flex-1 text-right text-xs" />
                                                    <Input type="tel" value={rep.phone} onChange={(e) => setSalesReps(prev => prev.map((r, i) => i === idx ? { ...r, phone: e.target.value } : r))} placeholder="هاتف" className="w-28 text-xs" dir="ltr" />
                                                    {idx > 0 && (
                                                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive shrink-0" onClick={() => removeSalesRep(idx)}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                            <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={addSalesRep}>
                                                <Plus className="w-3 h-3 ml-1" /> إضافة مندوب آخر
                                            </Button>
                                        </div>

                                        {/* Debt Amount */}
                                        {reviewRequest?.operation_type === 'insert' && (
                                            <div className="space-y-2 border-t pt-2">
                                                <Label className="text-xs">دين أولي</Label>
                                                <Input type="number" value={editPayload.debtAmount || ''} onChange={(e) => setEditPayload((p: any) => ({ ...p, debtAmount: Number(e.target.value) || 0 }))} placeholder="0" className="text-center" />
                                            </div>
                                        )}
                                    </CollapsibleContent>
                                </Collapsible>

                                {/* Requester info */}
                                <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground flex items-center gap-2">
                                    <UserCircle className="w-4 h-4 text-primary" />
                                    <span>المقدم بواسطة: <strong className="text-foreground">{reviewRequest.requester_name}</strong></span>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2 pb-2">
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="flex-1" onClick={() => setReviewRequest(null)}>إلغاء</Button>
                                        <Button variant="destructive" className="flex-1" onClick={() => handleReject(reviewRequest.id)} disabled={!!processingId}>
                                            <X className="w-4 h-4 ml-1" />رفض
                                        </Button>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproveWithEdits(false)} disabled={!!processingId}>
                                            {processingId ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Check className="w-4 h-4 ml-1" />}
                                            موافقة
                                        </Button>
                                        <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => handleApproveWithEdits(true)} disabled={!!processingId}>
                                            {processingId ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
                                            حفظ وموافقة
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CustomerApprovalTab;
