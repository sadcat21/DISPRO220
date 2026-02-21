import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Check, X, Loader2, User, Clock, AlertCircle, Phone, MapPin, Building2, Store, CreditCard, Shield, UserCircle, Save } from 'lucide-react';
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

const CustomerApprovalTab: React.FC = () => {
    const { workerId, role, activeBranch } = useAuth();
    const { t } = useLanguage();
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

    useEffect(() => {
        fetchRequests();
    }, [activeBranch]);

    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('customer_approval_requests')
                .select(`
          *,
          workers!requested_by(full_name)
        `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (role === 'branch_admin' && activeBranch) {
                query = query.eq('branch_id', activeBranch.id);
            }

            const { data, error } = await query;
            if (error) throw error;

            setRequests((data || []).map((r: any) => ({
                ...r,
                requester_name: r.workers?.full_name
            })));
        } catch (error: any) {
            console.error('Error fetching approval requests:', error);
            toast.error('خطأ في جلب طلبات الموافقة');
        } finally {
            setIsLoading(false);
        }
    };

    const openReviewDialog = (request: ApprovalRequest) => {
        setReviewRequest(request);
        setEditPayload({ ...request.payload });
    };

    const handleApproveWithEdits = async (applyEdits: boolean) => {
        if (!reviewRequest) return;
        setProcessingId(reviewRequest.id);
        try {
            const payload = applyEdits ? editPayload : reviewRequest.payload;

            if (reviewRequest.operation_type === 'insert') {
                const { debtAmount, ...customerData } = payload;
                const { data: newCustomer, error: insertError } = await supabase
                    .from('customers')
                    .insert(customerData)
                    .select()
                    .single();

                if (insertError) throw insertError;

                if (debtAmount > 0 && workerId) {
                    await createDebt.mutateAsync({
                        customer_id: newCustomer.id,
                        worker_id: reviewRequest.requested_by,
                        branch_id: reviewRequest.branch_id || undefined,
                        total_amount: debtAmount,
                        paid_amount: 0,
                        notes: 'دين أولي عند إنشاء العميل (عبر نظام الموافقة)',
                    });
                }

                trackVisit({ customerId: newCustomer.id, operationType: 'add_customer', operationId: newCustomer.id });
                toast.success(applyEdits ? 'تمت الموافقة مع حفظ التعديلات' : 'تمت الموافقة وإضافة العميل بنجاح');
            }
            else if (reviewRequest.operation_type === 'update' && reviewRequest.customer_id) {
                const { debtAmount, ...updateData } = payload;

                const { error: updateError } = await supabase
                    .from('customers')
                    .update(updateData)
                    .eq('id', reviewRequest.customer_id);

                if (updateError) throw updateError;
                toast.success(applyEdits ? 'تمت الموافقة مع حفظ التعديلات' : 'تمت الموافقة وتعديل العميل بنجاح');
            }
            else if (reviewRequest.operation_type === 'delete' && reviewRequest.customer_id) {
                const { error: deleteError } = await supabase
                    .from('customers')
                    .delete()
                    .eq('id', reviewRequest.customer_id);

                if (deleteError) throw deleteError;
                toast.success('تمت الموافقة وحذف العميل بنجاح');
            }

            // Mark request as approved
            const { error: statusError } = await supabase
                .from('customer_approval_requests')
                .update({
                    status: 'approved',
                    reviewed_by: workerId,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reviewRequest.id);

            if (statusError) throw statusError;

            setReviewRequest(null);
            fetchRequests();
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
                .update({
                    status: 'rejected',
                    reviewed_by: workerId,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (error) throw error;
            toast.info('تم رفض الطلب');
            setReviewRequest(null);
            fetchRequests();
        } catch (error: any) {
            console.error('Error rejecting request:', error);
            toast.error('فشل في رفض الطلب');
        } finally {
            setProcessingId(null);
        }
    };

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
                        <div className={`h-1 w-full ${request.operation_type === 'insert' ? 'bg-green-500' :
                            request.operation_type === 'update' ? 'bg-blue-500' : 'bg-red-500'
                            }`} />
                        <CardContent className="p-4">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={
                                            request.operation_type === 'insert' ? 'secondary' :
                                                request.operation_type === 'update' ? 'outline' : 'destructive'
                                        }>
                                            {request.operation_type === 'insert' ? 'إضافة عميل جديد' :
                                                request.operation_type === 'update' ? 'تعديل زبون قائم' : 'حذف زبون'}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(request.created_at).toLocaleString('ar-DZ')}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <User className="w-5 h-5 text-primary" />
                                        {request.payload.name || request.payload.customerName}
                                    </h3>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        {request.payload.phone && (
                                            <div className="flex items-center gap-1">
                                                <Phone className="w-3.5 h-3.5" />
                                                <span dir="ltr">{request.payload.phone}</span>
                                            </div>
                                        )}
                                        {request.payload.wilaya && (
                                            <div className="flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5" />
                                                <span>{request.payload.wilaya}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 col-span-full mt-2 pt-2 border-t">
                                            <UserCircle className="w-3.5 h-3.5 text-primary" />
                                            <span>المقدم بواسطة: </span>
                                            <span className="font-medium text-foreground">{request.requester_name}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-row md:flex-col gap-2 justify-end">
                                    <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                                        onClick={() => openReviewDialog(request)}
                                        disabled={!!processingId}
                                    >
                                        <Check className="w-4 h-4" />
                                        معاينة
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="gap-1"
                                        onClick={() => handleReject(request.id)}
                                        disabled={!!processingId}
                                    >
                                        {processingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        رفض
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}

            {/* Review/Edit Dialog */}
            <Dialog open={!!reviewRequest} onOpenChange={(open) => !open && setReviewRequest(null)}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-primary" />
                            {reviewRequest?.operation_type === 'delete' ? 'تأكيد حذف العميل' : 'مراجعة بيانات العميل'}
                        </DialogTitle>
                    </DialogHeader>

                    {reviewRequest && reviewRequest.operation_type === 'delete' ? (
                        <div className="space-y-4">
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                                <p className="font-bold text-lg">{reviewRequest.payload.name || reviewRequest.payload.customerName}</p>
                                <p className="text-sm text-muted-foreground mt-1">هل أنت متأكد من حذف هذا العميل؟</p>
                            </div>
                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => setReviewRequest(null)}>إلغاء</Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => handleApproveWithEdits(false)}
                                    disabled={!!processingId}
                                >
                                    {processingId ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                                    تأكيد الحذف
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : reviewRequest ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>اسم العميل *</Label>
                                <Input
                                    value={editPayload.name || ''}
                                    onChange={(e) => setEditPayload((p: any) => ({ ...p, name: e.target.value }))}
                                    className="text-right"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>الهاتف</Label>
                                <Input
                                    value={editPayload.phone || ''}
                                    onChange={(e) => setEditPayload((p: any) => ({ ...p, phone: e.target.value }))}
                                    className="text-right" dir="ltr"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>اسم المحل</Label>
                                <Input
                                    value={editPayload.store_name || ''}
                                    onChange={(e) => setEditPayload((p: any) => ({ ...p, store_name: e.target.value }))}
                                    className="text-right"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>الولاية</Label>
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
                                <Label>العنوان</Label>
                                <Input
                                    value={editPayload.address || ''}
                                    onChange={(e) => setEditPayload((p: any) => ({ ...p, address: e.target.value }))}
                                    className="text-right"
                                />
                            </div>
                            {sectors.length > 0 && (
                                <div className="space-y-2">
                                    <Label>السكتور</Label>
                                    <Select value={editPayload.sector_id || 'none'} onValueChange={(v) => setEditPayload((p: any) => ({ ...p, sector_id: v === 'none' ? null : v }))}>
                                        <SelectTrigger><SelectValue placeholder="اختر السكتور" /></SelectTrigger>
                                        <SelectContent className="bg-popover z-[10050]">
                                            <SelectItem value="none">بدون سكتور</SelectItem>
                                            {sectors.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* GPS Location */}
                            {(editPayload.latitude && editPayload.longitude) && (
                                <div className="text-xs text-muted-foreground bg-secondary/50 px-3 py-2 rounded-lg flex items-center gap-2">
                                    <MapPin className="w-3 h-3 text-primary" />
                                    <span dir="ltr">{editPayload.latitude?.toFixed(6)}, {editPayload.longitude?.toFixed(6)}</span>
                                </div>
                            )}

                            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground flex items-center gap-2">
                                <UserCircle className="w-4 h-4 text-primary" />
                                <span>المقدم بواسطة: <strong className="text-foreground">{reviewRequest.requester_name}</strong></span>
                            </div>

                            <DialogFooter className="gap-2 flex-col sm:flex-row">
                                <Button variant="outline" onClick={() => setReviewRequest(null)}>إلغاء</Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => handleReject(reviewRequest.id)}
                                    disabled={!!processingId}
                                >
                                    <X className="w-4 h-4 ml-1" />
                                    رفض
                                </Button>
                                <Button
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleApproveWithEdits(false)}
                                    disabled={!!processingId}
                                >
                                    {processingId ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Check className="w-4 h-4 ml-1" />}
                                    موافقة
                                </Button>
                                <Button
                                    className="bg-primary hover:bg-primary/90"
                                    onClick={() => handleApproveWithEdits(true)}
                                    disabled={!!processingId}
                                >
                                    {processingId ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
                                    حفظ وموافقة
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CustomerApprovalTab;