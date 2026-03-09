import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Users, UserCheck, Calendar, Download, Layers, Package, Settings2, Filter, Eye } from 'lucide-react';
import { Worker, OrderWithDetails, Product } from '@/types/database';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import PrintColumnsConfigDialog, { PrintColumnConfig, DEFAULT_PRINT_COLUMNS } from '@/components/print/PrintColumnsConfigDialog';
import { usePrintColumnsConfig } from '@/hooks/usePrintColumnsConfig';

interface PrintOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workers: Worker[];
  orders: OrderWithDetails[];
  products: Product[];
  onPrint: (filterWorkerId: string | null, printPerWorker: boolean, filteredOrders: OrderWithDetails[], groupCustomers: boolean, groupProducts: boolean, columnConfig: PrintColumnConfig[]) => void;
  onExportCSV: (filteredOrders: OrderWithDetails[]) => void;
  onPreview?: (filteredOrders: OrderWithDetails[], columnConfig: PrintColumnConfig[]) => void;
}

const PrintOrdersDialog: React.FC<PrintOrdersDialogProps> = ({
  open,
  onOpenChange,
  workers,
  orders,
  products,
  onPrint,
  onExportCSV,
  onPreview,
}) => {
  const { t, language, dir } = useLanguage();
  const { columns: dbColumns, saveColumns } = usePrintColumnsConfig();
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [printPerWorker, setPrintPerWorker] = useState(false);
  const [deliveryDateFrom, setDeliveryDateFrom] = useState<string>('');
  const [deliveryDateTo, setDeliveryDateTo] = useState<string>('');
  const [groupCustomers, setGroupCustomers] = useState(true);
  const [groupProducts, setGroupProducts] = useState(true);
  const [showColumnsConfig, setShowColumnsConfig] = useState(false);
  const [columnConfig, setColumnConfig] = useState<PrintColumnConfig[]>(dbColumns);

  // Sync from DB when loaded
  React.useEffect(() => {
    setColumnConfig(dbColumns);
  }, [dbColumns]);

  const handleColumnsChange = (cols: PrintColumnConfig[]) => {
    setColumnConfig(cols);
    saveColumns(cols);
  };

  const getDateLocale = () => {
    switch (language) {
      case 'fr': return fr;
      case 'en': return enUS;
      default: return ar;
    }
  };

  // Filter orders based on all criteria
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Filter by status
    if (statusFilter === 'active') {
      result = result.filter(o => o.status === 'pending' || o.status === 'assigned' || o.status === 'in_progress');
    } else if (statusFilter === 'delivered') {
      result = result.filter(o => o.status === 'delivered');
    }

    if (deliveryDateFrom) {
      result = result.filter(o => o.delivery_date && o.delivery_date >= deliveryDateFrom);
    }
    if (deliveryDateTo) {
      result = result.filter(o => o.delivery_date && o.delivery_date <= deliveryDateTo);
    }

    if (!printPerWorker && selectedWorkerFilter !== 'all') {
      if (selectedWorkerFilter === 'unassigned') {
        result = result.filter(o => !o.assigned_worker_id);
      } else {
        result = result.filter(o => o.assigned_worker_id === selectedWorkerFilter);
      }
    }

    return result;
  }, [orders, deliveryDateFrom, deliveryDateTo, selectedWorkerFilter, printPerWorker, statusFilter]);

  const workersWithOrders = useMemo(() => {
    return workers.filter(worker => 
      filteredOrders.some(order => order.assigned_worker_id === worker.id)
    );
  }, [workers, filteredOrders]);

  const getWorkerOrderCount = (workerId: string) => {
    return filteredOrders.filter(o => o.assigned_worker_id === workerId).length;
  };

  const unassignedOrdersCount = useMemo(() => {
    return filteredOrders.filter(o => !o.assigned_worker_id).length;
  }, [filteredOrders]);

  const handlePrint = () => {
    const filterWorkerId = selectedWorkerFilter === 'all' ? null : 
                          selectedWorkerFilter === 'unassigned' ? 'unassigned' : 
                          selectedWorkerFilter;
    onPrint(filterWorkerId, printPerWorker, filteredOrders, groupCustomers, groupProducts, columnConfig);
    onOpenChange(false);
  };

  const handleExportCSV = () => {
    onExportCSV(filteredOrders);
  };

  const getDisplayOrdersCount = () => {
    if (printPerWorker) {
      return filteredOrders.filter(o => o.assigned_worker_id).length;
    }
    return filteredOrders.length;
  };

  const getDateRangeText = () => {
    if (!deliveryDateFrom && !deliveryDateTo) return null;
    if (deliveryDateFrom && deliveryDateTo) {
      return `${format(new Date(deliveryDateFrom), 'dd MMM', { locale: getDateLocale() })} - ${format(new Date(deliveryDateTo), 'dd MMM', { locale: getDateLocale() })}`;
    }
    if (deliveryDateFrom) {
      return `${t('print.from')} ${format(new Date(deliveryDateFrom), 'dd MMM yyyy', { locale: getDateLocale() })}`;
    }
    return `${t('print.to')} ${format(new Date(deliveryDateTo), 'dd MMM yyyy', { locale: getDateLocale() })}`;
  };

  const resetDateFilters = () => {
    setDeliveryDateFrom('');
    setDeliveryDateTo('');
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4" dir={dir}>
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Printer className="w-4 h-4" />
              {t('print.title')}
            </DialogTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowColumnsConfig(true)}>
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="space-y-3 py-2 px-1">
            {/* Filter by Status */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Filter className="w-3.5 h-3.5" />
                {t('print.filter_by_status')}
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('print.all_statuses')}</SelectItem>
                  <SelectItem value="active">{t('print.status_pending_assigned')}</SelectItem>
                  <SelectItem value="delivered">{t('print.status_delivered')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Delivery Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Calendar className="w-3.5 h-3.5" />
                {t('print.filter_by_date')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">{t('print.from')}</Label>
                  <Input
                    type="date"
                    value={deliveryDateFrom}
                    onChange={(e) => setDeliveryDateFrom(e.target.value)}
                    className="text-sm h-9"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs text-muted-foreground">{t('print.to')}</Label>
                  <Input
                    type="date"
                    value={deliveryDateTo}
                    onChange={(e) => setDeliveryDateTo(e.target.value)}
                    className="text-sm h-9"
                  />
                </div>
              </div>
              {(deliveryDateFrom || deliveryDateTo) && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{getDateRangeText()}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={resetDateFilters}>
                    {t('print.clear_filter')}
                  </Button>
                </div>
              )}
            </div>

            {/* Filter by Worker */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <UserCheck className="w-3.5 h-3.5" />
                {t('print.filter_by_worker')}
              </Label>
              <Select 
                value={selectedWorkerFilter} 
                onValueChange={setSelectedWorkerFilter}
                disabled={printPerWorker}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('print.select_worker')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {t('print.all_orders')} ({filteredOrders.length})
                    </span>
                  </SelectItem>
                  <SelectItem value="unassigned">
                    <span className="flex items-center gap-2 text-orange-600">
                      {t('print.without_worker')} ({unassignedOrdersCount})
                    </span>
                  </SelectItem>
                  {workersWithOrders.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      <span className="flex items-center gap-2">
                        {worker.full_name} ({getWorkerOrderCount(worker.id)})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Print Per Worker Option */}
            <div className="flex items-center space-x-2 space-x-reverse bg-muted/50 p-3 rounded-lg">
              <Checkbox
                id="printPerWorker"
                checked={printPerWorker}
                onCheckedChange={(checked) => {
                  setPrintPerWorker(checked as boolean);
                  if (checked) {
                    setSelectedWorkerFilter('all');
                  }
                }}
              />
              <Label htmlFor="printPerWorker" className="flex-1 cursor-pointer">
                <div className="text-sm font-medium">{t('print.per_worker')}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('print.per_worker_desc')}
                </p>
              </Label>
            </div>

            {/* Grouping Options */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="groupCustomers" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{t('print.group_customers')}</div>
                    <p className="text-xs text-muted-foreground">{t('print.group_customers_desc')}</p>
                  </div>
                </Label>
                <Switch
                  id="groupCustomers"
                  checked={groupCustomers}
                  onCheckedChange={setGroupCustomers}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="groupProducts" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{t('print.group_products')}</div>
                    <p className="text-xs text-muted-foreground">{t('print.group_products_desc')}</p>
                  </div>
                </Label>
                <Switch
                  id="groupProducts"
                  checked={groupProducts}
                  onCheckedChange={setGroupProducts}
                />
              </div>
            </div>

            {/* Workers with orders summary */}
            {printPerWorker && workersWithOrders.length > 0 && (
              <div className="bg-accent/50 p-3 rounded-lg">
                <p className="text-xs font-medium mb-1.5">
                  {t('print.pages_count').replace('{count}', String(workersWithOrders.length))}:
                </p>
                <ScrollArea className="max-h-24">
                  <ul className="text-xs space-y-1">
                    {workersWithOrders.map((worker) => (
                      <li key={worker.id} className="flex items-center justify-between">
                        <span>{worker.full_name}</span>
                        <span className="text-muted-foreground">{getWorkerOrderCount(worker.id)} {t('print.orders_count')}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            {/* Summary */}
            <div className="bg-primary/10 p-3 rounded-lg text-center">
              <p className="text-base font-bold">{getDisplayOrdersCount()}</p>
              <p className="text-xs text-muted-foreground">{t('print.orders_to_print')}</p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button 
                onClick={handlePrint} 
                disabled={getDisplayOrdersCount() === 0}
                className="h-9"
              >
                <Printer className="w-4 h-4 ms-2" />
                {t('common.print')}
              </Button>
              {onPreview && (
                <Button
                  variant="secondary"
                  onClick={() => onPreview(filteredOrders, columnConfig)}
                  disabled={filteredOrders.length === 0}
                  className="h-9"
                >
                  <Eye className="w-4 h-4 ms-2" />
                  {t('orders.preview') || 'معاينة'}
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={handleExportCSV}
                disabled={filteredOrders.length === 0}
                className="h-9"
              >
                <Download className="w-4 h-4 ms-2" />
                {t('common.export_csv')}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    <PrintColumnsConfigDialog
      open={showColumnsConfig}
      onOpenChange={setShowColumnsConfig}
      columns={columnConfig}
      onColumnsChange={handleColumnsChange}
    />
    </>
  );
};

export default PrintOrdersDialog;
