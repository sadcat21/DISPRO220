import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Banknote, Search, Users, AlertCircle, Calendar, FileCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate } from '@/utils/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomerDebts } from '@/hooks/useCustomerDebts';
import { useWorkerPermissions } from '@/hooks/usePermissions';
import { CustomerDebtWithDetails } from '@/types/accounting';
import DebtDetailsDialog from '@/components/debts/DebtDetailsDialog';
import PendingDocumentsSection from '@/components/debts/PendingDocumentsSection';
import PermissionGate from '@/components/auth/PermissionGate';
import { useIsElementHidden } from '@/hooks/useUIOverrides';
import { isAdminRole } from '@/lib/utils';

const DAY_INDEX_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const getNextCollectionDate = (debt: CustomerDebtWithDetails): string | null => {
  if (debt.status === 'paid') return null;
  const collectionType = debt.collection_type;
  const collectionDays = debt.collection_days;
  if (collectionType === 'daily') return new Date().toISOString().slice(0, 10);
  if (collectionType === 'weekly' && collectionDays && collectionDays.length > 0) {
    const now = new Date();
    const todayIndex = now.getDay();
    let minOffset = 8;
    for (const dayKey of collectionDays) {
      const targetIndex = DAY_INDEX_MAP[dayKey];
      if (targetIndex === undefined) continue;
      let offset = (targetIndex - todayIndex + 7) % 7;
      if (offset === 0) offset = 0;
      if (offset < minOffset) minOffset = offset;
    }
    if (minOffset <= 7) {
      const next = new Date(now);
      next.setDate(next.getDate() + minOffset);
      return next.toISOString().slice(0, 10);
    }
  }
  return debt.due_date || null;
};

const CustomerDebts: React.FC = () => {
  const { t, language } = useLanguage();
  const { role, workerId } = useAuth();
  const isAdmin = isAdminRole(role);
  const isCollectDebtHidden = useIsElementHidden('button', 'collect_debt_btn');
  const [activeTab, setActiveTab] = useState<'debts' | 'documents'>('debts');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; debts: CustomerDebtWithDetails[] } | null>(null);
  const location = useLocation();

  const { data: debts, isLoading } = useCustomerDebts({ status: statusFilter });

  const customerGroups = useMemo(() => {
    if (!debts) return [];
    const groups: Record<string, { id: string; name: string; phone: string | null; wilaya: string | null; debts: CustomerDebtWithDetails[]; totalRemaining: number; lastPaymentDate: string | null; nextDueDate: string | null }> = {};
    debts.forEach(debt => {
      const cId = debt.customer_id;
      if (!groups[cId]) {
        groups[cId] = { id: cId, name: debt.customer?.name || '—', phone: debt.customer?.phone || null, wilaya: debt.customer?.wilaya || null, debts: [], totalRemaining: 0, lastPaymentDate: null, nextDueDate: null };
      }
      groups[cId].debts.push(debt);
      groups[cId].totalRemaining += Number(debt.remaining_amount);
      const nextDate = getNextCollectionDate(debt);
      if (nextDate) {
        const current = groups[cId].nextDueDate;
        if (!current || nextDate < current) groups[cId].nextDueDate = nextDate;
      }
    });
    return Object.values(groups)
      .filter(g => {
        if (!search) return true;
        const s = search.toLowerCase();
        return g.name.toLowerCase().includes(s) || (g.phone && g.phone.includes(s));
      })
      .sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [debts, search]);

  useEffect(() => {
    if (location.state?.customerId && customerGroups.length > 0) {
      const group = customerGroups.find(g => g.id === location.state.customerId);
      if (group) {
        setSelectedCustomer({ id: group.id, name: group.name, debts: group.debts });
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, customerGroups]);

  // Check if navigated with tab=documents
  useEffect(() => {
    if (location.state?.tab === 'documents') {
      setActiveTab('documents');
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const totalActiveDebts = customerGroups.reduce((sum, g) => sum + g.totalRemaining, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PermissionGate requiredPermissions={['page_customer_debts', 'view_customer_debts', 'collect_debts']}>
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Banknote className="w-5 h-5 text-primary" />
          {t('debts.title')}
        </h2>

        {/* Tabs: Debts vs Pending Documents */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} dir="rtl">
          <TabsList className="w-full h-10 p-1 bg-muted/60">
            <TabsTrigger value="debts" className="flex-1 gap-1.5 data-[state=active]:shadow-sm">
              <Banknote className="w-4 h-4" />
              <span className="text-xs font-bold">{t('debts.debts_tab')}</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex-1 gap-1.5 data-[state=active]:shadow-sm">
              <FileCheck className="w-4 h-4" />
              <span className="text-xs font-bold">{t('debts.pending_documents')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="debts" className="space-y-4 mt-4">
            {/* Summary Card */}
            <Card className="bg-destructive/10 border-destructive/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('debts.total_debts')}</p>
                  <p className="text-2xl font-bold text-destructive">{totalActiveDebts.toLocaleString()} DA</p>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <span className="text-lg font-bold">{customerGroups.length}</span>
                </div>
              </CardContent>
            </Card>

            {/* Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} className="pr-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="active">{t('debts.active')}</SelectItem>
                  <SelectItem value="partially_paid">{t('debts.partially_paid')}</SelectItem>
                  <SelectItem value="paid">{t('debts.paid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Customer List */}
            {customerGroups.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{t('debts.no_debts')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {customerGroups.map(group => (
                  <Card
                    key={group.id}
                    className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
                    onClick={() => setSelectedCustomer({ id: group.id, name: group.name, debts: group.debts })}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold">{group.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            {group.phone && <span>{group.phone}</span>}
                            {group.wilaya && <span>• {group.wilaya}</span>}
                            <span>• {group.debts.length} {group.debts.length === 1 ? t('debts.debt_count_singular') : t('debts.debt_count_plural')}</span>
                          </div>
                          {group.nextDueDate && (
                            <div className="flex items-center gap-1 text-xs mt-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">{t('debts.next_due')}:</span>
                              <span className={new Date(group.nextDueDate + (group.nextDueDate.includes('T') ? '' : 'T00:00:00')) < new Date() ? 'text-destructive font-medium' : 'text-primary font-medium'}>
                                {group.nextDueDate.includes('T')
                                  ? formatDate(new Date(group.nextDueDate), 'EEEE dd/MM/yyyy HH:mm', language)
                                  : formatDate(new Date(group.nextDueDate + 'T00:00:00'), 'EEEE dd/MM/yyyy', language)
                                }
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-lg font-bold text-destructive">{group.totalRemaining.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">DA</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <PendingDocumentsSection />
          </TabsContent>
        </Tabs>

        {/* Debt Details Dialog */}
        {selectedCustomer && (
          <DebtDetailsDialog
            open={!!selectedCustomer}
            onOpenChange={(open) => !open && setSelectedCustomer(null)}
            debts={selectedCustomer.debts}
            customerName={selectedCustomer.name}
          />
        )}
      </div>
    </PermissionGate>
  );
};

export default CustomerDebts;