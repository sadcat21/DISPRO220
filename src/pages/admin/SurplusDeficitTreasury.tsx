import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle, Package, Banknote, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

const fmt = (n: number) => n.toLocaleString();

const SurplusDeficitTreasury: React.FC = () => {
  const { activeBranch } = useAuth();
  const { dir, t } = useLanguage();

  // Fetch cash surplus/deficit from manager_treasury
  const { data: cashEntries = [] } = useQuery({
    queryKey: ['surplus-deficit-cash', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('manager_treasury')
        .select('*')
        .in('source_type', ['accounting_surplus', 'accounting_deficit'])
        .order('created_at', { ascending: false });
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch customer surplus entries
  const { data: customerSurplusEntries = [] } = useQuery({
    queryKey: ['surplus-deficit-customer', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('manager_treasury')
        .select('*')
        .eq('source_type', 'customer_surplus')
        .order('created_at', { ascending: false });
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch stock discrepancies
  const { data: stockEntries = [] } = useQuery({
    queryKey: ['surplus-deficit-stock', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('stock_discrepancies')
        .select('*, product:products(name), worker:workers(full_name)')
        .order('created_at', { ascending: false });
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const totalCashSurplus = cashEntries
    .filter((e: any) => e.source_type === 'accounting_surplus')
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const totalCashDeficit = cashEntries
    .filter((e: any) => e.source_type === 'accounting_deficit')
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const totalCustomerSurplus = customerSurplusEntries
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const totalStockSurplus = stockEntries
    .filter((e: any) => e.discrepancy_type === 'surplus')
    .reduce((s: number, e: any) => s + Number(e.monetary_value || 0), 0);
  const totalStockDeficit = stockEntries
    .filter((e: any) => e.discrepancy_type === 'deficit')
    .reduce((s: number, e: any) => s + Number(e.monetary_value || 0), 0);

  return (
    <div className="p-4 space-y-4" dir={dir}>
      <h2 className="text-xl font-bold">{t('surplus.title')}</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-green-300 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="text-xs font-bold text-green-800 dark:text-green-300">{t('surplus.total_surplus')}</span>
          </div>
          <p className="text-lg font-bold text-green-700 dark:text-green-400">{fmt(totalCashSurplus + totalStockSurplus + totalCustomerSurplus)} DA</p>
          <p className="text-[10px] text-green-600 dark:text-green-500">{t('surplus.treasury_label')} {fmt(totalCashSurplus)} • {t('surplus.customers_label')} {fmt(totalCustomerSurplus)} • {t('surplus.stock_label')} {fmt(totalStockSurplus)}</p>
        </div>
        <div className="rounded-xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <span className="text-xs font-bold text-red-800 dark:text-red-300">{t('surplus.total_deficit')}</span>
          </div>
          <p className="text-lg font-bold text-destructive">{fmt(totalCashDeficit + totalStockDeficit)} DA</p>
          <p className="text-[10px] text-red-600 dark:text-red-500">{t('surplus.treasury_label')} {fmt(totalCashDeficit)} • {t('surplus.stock_label')} {fmt(totalStockDeficit)}</p>
        </div>
      </div>

      <Tabs defaultValue="cash" dir={dir}>
        <TabsList className="w-full">
          <TabsTrigger value="cash" className="flex-1 gap-1.5">
            <Banknote className="w-4 h-4" />
            {t('surplus.treasury_tab')}
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex-1 gap-1.5">
            <Users className="w-4 h-4" />
            {t('surplus.customer_surplus_tab')}
          </TabsTrigger>
          <TabsTrigger value="stock" className="flex-1 gap-1.5">
            <Package className="w-4 h-4" />
            {t('surplus.stock_tab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cash">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 mt-2">
              {cashEntries.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">{t('surplus.no_records')}</p>
              )}
              {cashEntries.map((entry: any) => {
                const isSurplus = entry.source_type === 'accounting_surplus';
                return (
                  <div key={entry.id} className={`rounded-xl border p-3 ${isSurplus ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : 'border-red-200 bg-red-50/50 dark:bg-red-900/10'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSurplus ? <ArrowUpCircle className="w-4 h-4 text-green-600" /> : <ArrowDownCircle className="w-4 h-4 text-destructive" />}
                        <span className={`text-sm font-bold ${isSurplus ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                          {isSurplus ? t('surplus.surplus_word') : t('surplus.deficit_word')} {fmt(Number(entry.amount))} DA
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="customers">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 mt-2">
              {customerSurplusEntries.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">{t('surplus.no_customer_surplus')}</p>
              )}
              {customerSurplusEntries.map((entry: any) => (
                <div key={entry.id} className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                        {t('surplus.customer_surplus')} {fmt(Number(entry.amount))} DA
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  {entry.customer_name && (
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1">{entry.customer_name}</p>
                  )}
                  {entry.notes && <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="stock">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 mt-2">
              {stockEntries.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">{t('surplus.no_records')}</p>
              )}
              {stockEntries.map((entry: any) => {
                const isSurplus = entry.discrepancy_type === 'surplus';
                return (
                  <div key={entry.id} className={`rounded-xl border p-3 ${isSurplus ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : 'border-red-200 bg-red-50/50 dark:bg-red-900/10'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSurplus ? <ArrowUpCircle className="w-4 h-4 text-green-600" /> : <ArrowDownCircle className="w-4 h-4 text-destructive" />}
                        <span className={`text-sm font-bold ${isSurplus ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                          {isSurplus ? t('surplus.surplus_word') : t('surplus.deficit_word')} - {(entry.product as any)?.name || ''}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                      <span>{t('surplus.quantity')} {Number(entry.quantity)} • {(entry.worker as any)?.full_name || ''}</span>
                      {entry.monetary_value > 0 && <span className="font-medium">{fmt(Number(entry.monetary_value))} DA</span>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block ${entry.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {entry.status === 'resolved' ? t('surplus.resolved') : t('surplus.pending')}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SurplusDeficitTreasury;
