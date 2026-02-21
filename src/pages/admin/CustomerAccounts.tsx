import { useState } from 'react';
import { useCustomerAccounts, useApproveCustomerAccount, useRejectCustomerAccount, useSuspendCustomerAccount, useReactivateCustomerAccount } from '@/hooks/useCustomerAccounts';
import { CustomerAccountStatus, ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_COLORS } from '@/types/customerAccount';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, UserCheck, UserX, Ban, RotateCcw, Eye, Store, Phone, MapPin, Calendar, PhoneCall } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const CustomerAccounts = () => {
  const [activeTab, setActiveTab] = useState<CustomerAccountStatus | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: accounts, isLoading } = useCustomerAccounts(activeTab === 'all' ? undefined : activeTab);
  const approveAccount = useApproveCustomerAccount();
  const rejectAccount = useRejectCustomerAccount();
  const suspendAccount = useSuspendCustomerAccount();
  const reactivateAccount = useReactivateCustomerAccount();

  const filteredAccounts = accounts?.filter(account =>
    account.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.phone.includes(searchQuery) ||
    account.username.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const pendingCount = accounts?.filter(a => a.status === 'pending').length || 0;

  const handleApprove = (accountId: string) => {
    approveAccount.mutate({ accountId });
  };

  const handleReject = () => {
    if (selectedAccount && rejectionReason.trim()) {
      rejectAccount.mutate({ accountId: selectedAccount.id, reason: rejectionReason });
      setShowRejectDialog(false);
      setRejectionReason('');
      setSelectedAccount(null);
    }
  };

  const handleSuspend = (accountId: string) => {
    suspendAccount.mutate(accountId);
  };

  const handleReactivate = (accountId: string) => {
    reactivateAccount.mutate(accountId);
  };

  const openRejectDialog = (account: any) => {
    setSelectedAccount(account);
    setShowRejectDialog(true);
  };

  const openDetailsDialog = (account: any) => {
    setSelectedAccount(account);
    setShowDetailsDialog(true);
  };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">حسابات التجار</h1>
        {pendingCount > 0 && activeTab !== 'pending' && (
          <Badge variant="destructive" className="text-sm">
            {pendingCount} طلب جديد
          </Badge>
        )}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="بحث باسم المتجر، الاسم، الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="relative">
            قيد الانتظار
            {pendingCount > 0 && (
              <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">مفعّل</TabsTrigger>
          <TabsTrigger value="rejected">مرفوض</TabsTrigger>
          <TabsTrigger value="suspended">موقوف</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد حسابات</div>
          ) : (
            <div className="space-y-3">
              {filteredAccounts.map((account) => (
                <Card key={account.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-primary" />
                          <span className="font-semibold">{account.store_name}</span>
                          <Badge className={ACCOUNT_STATUS_COLORS[account.status as CustomerAccountStatus]}>
                            {ACCOUNT_STATUS_LABELS[account.status as CustomerAccountStatus]}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div className="flex items-center gap-2">
                            <span>{account.full_name}</span>
                            <span>•</span>
                            <span>@{account.username}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            <span>{account.phone}</span>
                          </div>
                          {account.wilaya && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3" />
                              <span>{account.wilaya}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(account.created_at), 'dd MMM yyyy', { locale: ar })}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailsDialog(account)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        {account.status === 'pending' && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleApprove(account.id)}
                              disabled={approveAccount.isPending}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openRejectDialog(account)}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        {account.phone && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 border-green-600 hover:bg-green-50"
                            onClick={() => window.open(`tel:${account.phone}`, '_self')}
                          >
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                        )}

                        {account.status === 'approved' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSuspend(account.id)}
                            disabled={suspendAccount.isPending}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}

                        {(account.status === 'suspended' || account.status === 'rejected') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReactivate(account.id)}
                            disabled={reactivateAccount.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {account.rejection_reason && (
                      <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
                        <strong>سبب الرفض:</strong> {account.rejection_reason}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل التاجر</DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">اسم المتجر</Label>
                  <p className="font-medium">{selectedAccount.store_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الاسم الكامل</Label>
                  <p className="font-medium">{selectedAccount.full_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">اسم المستخدم</Label>
                  <p className="font-medium">@{selectedAccount.username}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الهاتف</Label>
                  <p className="font-medium">{selectedAccount.phone}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الولاية</Label>
                  <p className="font-medium">{selectedAccount.wilaya || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">نوع النشاط</Label>
                  <p className="font-medium">{selectedAccount.business_type || '-'}</p>
                </div>
              </div>
              {selectedAccount.address && (
                <div>
                  <Label className="text-muted-foreground">العنوان</Label>
                  <p className="font-medium">{selectedAccount.address}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">تاريخ التسجيل</Label>
                <p className="font-medium">
                  {format(new Date(selectedAccount.created_at), 'dd MMMM yyyy - HH:mm', { locale: ar })}
                </p>
              </div>
              {selectedAccount.approved_at && (
                <div>
                  <Label className="text-muted-foreground">تاريخ التفعيل</Label>
                  <p className="font-medium">
                    {format(new Date(selectedAccount.approved_at), 'dd MMMM yyyy - HH:mm', { locale: ar })}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض طلب التاجر</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>سبب الرفض</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="اكتب سبب رفض الطلب..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectionReason.trim() || rejectAccount.isPending}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerAccounts;
