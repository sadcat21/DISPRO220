import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PromoWithDetails, Worker, Product } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Users, Calendar as CalendarIcon, Loader2, FileSpreadsheet, Search, Printer, Package, Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, subDays } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn, isAdminRole } from '@/lib/utils';
import PromoPrintView from '@/components/print/PromoPrintView';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, Language } from '@/contexts/LanguageContext';

const PromoTable: React.FC = () => {
  const { activeBranch, role } = useAuth();
  const { t, language } = useLanguage();

  const getDateLocale = (lang: Language) => {
    switch (lang) {
      case 'fr': return fr;
      case 'en': return enUS;
      default: return ar;
    }
  };
  const [promos, setPromos] = useState<PromoWithDetails[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<string>('all');
  const [dateFilterType, setDateFilterType] = useState<string>('current');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isPrintVisible, setIsPrintVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [promosRes, workersRes, productsRes] = await Promise.all([
        supabase
          .from('promos')
          .select(`
            *,
            customer:customers(*),
            product:products(*),
            worker:workers(*)
          `)
          .order('promo_date', { ascending: false }),
        supabase
          .from('workers_safe')
          .select('*')
          .eq('role', 'worker'),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (promosRes.error) throw promosRes.error;
      if (workersRes.error) throw workersRes.error;
      if (productsRes.error) throw productsRes.error;

      setPromos(promosRes.data as PromoWithDetails[] || []);
      setWorkers(workersRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('stats.load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const getDateRange = () => {
    const now = new Date();
    if (dateFilterType === 'custom' && startDate && endDate) {
      // Set end date to end of day
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      return { start: startDate, end: endDateTime };
    } else if (dateFilterType === 'today') {
      return { start: startOfDay(now), end: endOfDay(now) };
    } else if (dateFilterType === 'yesterday') {
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    } else if (dateFilterType === 'current') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    } else if (dateFilterType === 'last') {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    return { start: new Date(0), end: now };
  };

  // Filter workers by activeBranch
  const filteredWorkers = useMemo(() => {
    if (isAdminRole(role) && activeBranch) {
      return workers.filter(w => w.branch_id === activeBranch.id);
    }
    return workers;
  }, [workers, activeBranch, role]);

  const filteredPromos = useMemo(() => {
    const { start, end } = getDateRange();
    
    return promos.filter((promo) => {
      const promoDate = new Date(promo.promo_date);
      const inDateRange = promoDate >= start && promoDate <= end;
      const matchesWorker = selectedWorker === 'all' || promo.worker_id === selectedWorker;
      const matchesProduct = selectedProduct === 'all' || promo.product_id === selectedProduct;
      
      // Branch filter based on activeBranch
      const matchesBranch = !activeBranch || promo.worker?.branch_id === activeBranch.id;
      
      // Search filter
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        promo.customer?.name?.toLowerCase().includes(query) ||
        promo.customer?.phone?.toLowerCase().includes(query) ||
        promo.customer?.wilaya?.toLowerCase().includes(query) ||
        promo.customer?.address?.toLowerCase().includes(query) ||
        promo.product?.name?.toLowerCase().includes(query) ||
        promo.worker?.full_name?.toLowerCase().includes(query);
      
      return inDateRange && matchesWorker && matchesProduct && matchesSearch && matchesBranch;
    });
  }, [promos, selectedWorker, dateFilterType, startDate, endDate, selectedProduct, searchQuery, activeBranch]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedWorker, dateFilterType, startDate, endDate, selectedProduct, searchQuery]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredPromos.length / pageSize));
  }, [filteredPromos.length]);

  const paginatedPromos = useMemo(() => {
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safePage - 1) * pageSize;
    return filteredPromos.slice(startIndex, startIndex + pageSize);
  }, [filteredPromos, currentPage, totalPages]);

  // Filter products for dropdown based on search
  const filteredProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return products;
    return products.filter(p => 
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase())
    );
  }, [products, productSearchQuery]);

  const getWorkerName = () => {
    if (selectedWorker === 'all') return t('promos.all_workers');
    return workers.find(w => w.id === selectedWorker)?.full_name || '';
  };

  const getProductName = () => {
    if (selectedProduct === 'all') return t('promos.all_products');
    return products.find(p => p.id === selectedProduct)?.name || '';
  };

  // Algerian French month names
  const algerianMonths = [
    'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
    'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  const formatAlgerianDate = (date: Date) => {
    const month = algerianMonths[date.getMonth()];
    const year = date.getFullYear();
    return `${month} ${year}`;
  };

  const getDateRangeText = () => {
    const now = new Date();
    if (dateFilterType === 'custom' && startDate && endDate) {
      return `${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`;
    }
    if (dateFilterType === 'today') {
      return `${t('date.today')} - ${format(now, 'dd/MM/yyyy')}`;
    }
    if (dateFilterType === 'yesterday') {
      const yesterday = subDays(now, 1);
      return `${t('date.yesterday')} - ${format(yesterday, 'dd/MM/yyyy')}`;
    }
    if (dateFilterType === 'current') {
      return formatAlgerianDate(now);
    }
    if (dateFilterType === 'last') {
      const lastMonth = subMonths(now, 1);
      return formatAlgerianDate(lastMonth);
    }
    return t('promos.all_periods');
  };

  const handlePrint = () => {
    setIsPrintVisible(true);
    
    // Give time for portal to render
    setTimeout(() => {
      window.print();
      
      // Hide after print dialog closes
      setTimeout(() => {
        setIsPrintVisible(false);
      }, 500);
    }, 100);
  };

  const handleExportCSV = () => {
    if (filteredPromos.length === 0) {
      toast.error(t('promos.no_data_export'));
      return;
    }

    // CSV headers - use translated headers
    const headers = ['#', t('common.name'), t('common.address'), t('customers.wilaya'), t('common.phone'), t('products.name'), t('promos.sales'), t('promos.free'), t('orders.worker'), t('common.date')];
    
    // CSV rows
    const rows = filteredPromos.map((promo, index) => [
      index + 1,
      promo.customer?.name || '',
      promo.customer?.address || '',
      promo.customer?.wilaya || '',
      promo.customer?.phone || '',
      promo.product?.name || '',
      promo.vente_quantity,
      promo.gratuite_quantity,
      promo.worker?.full_name || '',
      format(new Date(promo.promo_date), 'dd/MM/yyyy')
    ]);

    // Add totals row
    const totalVente = filteredPromos.reduce((sum, p) => sum + p.vente_quantity, 0);
    const totalGratuite = filteredPromos.reduce((sum, p) => sum + p.gratuite_quantity, 0);
    rows.push(['', '', '', '', '', t('common.total'), totalVente, totalGratuite, '', '']);

    // Convert to CSV string with BOM for Arabic support
    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `promo_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(t('promos.export_success'));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Print View (hidden, shown only during print) */}
      <PromoPrintView
        promos={filteredPromos}
        workerName={getWorkerName()}
        productName={getProductName()}
        dateRange={getDateRangeText()}
        isVisible={isPrintVisible}
      />

      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold">{t('promos.table')}</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleExportCSV}
            disabled={filteredPromos.length === 0}
            className="gap-2 font-semibold shadow-md"
          >
            <Download className="w-5 h-5" />
            {t('common.export_csv')}
          </Button>
          <Button
            onClick={handlePrint}
            disabled={filteredPromos.length === 0}
            className="gap-2 font-semibold shadow-md"
          >
            <Printer className="w-5 h-5" />
            {t('common.print')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative no-print">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('promos.search_placeholder')}
          className="pr-10 text-right"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 no-print">
        {/* Date Filter Type */}
        <Select value={dateFilterType} onValueChange={(value) => {
          setDateFilterType(value);
          if (value !== 'custom') {
            setStartDate(undefined);
            setEndDate(undefined);
          }
        }}>
          <SelectTrigger className="flex-1 min-w-[140px]">
            <CalendarIcon className="w-4 h-4 ml-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="today">{t('date.today')}</SelectItem>
            <SelectItem value="yesterday">{t('date.yesterday')}</SelectItem>
            <SelectItem value="current">{t('date.this_month')}</SelectItem>
            <SelectItem value="last">{t('date.last_month')}</SelectItem>
            <SelectItem value="custom">{t('date.custom')}</SelectItem>
            <SelectItem value="all">{t('date.all')}</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom Date Range Pickers */}
        {dateFilterType === 'custom' && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 min-w-[130px] justify-start text-right font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : t('promos.from_date')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 min-w-[130px] justify-start text-right font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : t('promos.to_date')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  disabled={(date) => startDate ? date < startDate : false}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        <Select value={selectedWorker} onValueChange={setSelectedWorker}>
          <SelectTrigger className="flex-1 min-w-[140px]">
            <Users className="w-4 h-4 ml-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">{t('promos.all_workers')}</SelectItem>
            {filteredWorkers.map((worker) => (
              <SelectItem key={worker.id} value={worker.id}>
                {worker.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Product Filter with Search */}
        <Select value={selectedProduct} onValueChange={(value) => {
          setSelectedProduct(value);
          setProductSearchQuery('');
        }}>
          <SelectTrigger className="flex-1 min-w-[140px]">
            <Package className="w-4 h-4 ml-2" />
            <SelectValue placeholder="المنتج" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <div className="p-2">
              <Input
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                placeholder={t('common.search')}
                className="h-8 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <SelectItem value="all">{t('promos.all_products')}</SelectItem>
            {filteredProducts.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <Card className="bg-primary/5 no-print">
        <CardContent className="p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('promos.total_operations')}:</span>
            <span className="font-bold">{filteredPromos.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('promos.total_sales')}:</span>
            <span className="font-bold text-primary">{filteredPromos.reduce((sum, p) => sum + p.vente_quantity, 0)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('promos.total_free')}:</span>
            <span className="font-bold text-primary">{filteredPromos.reduce((sum, p) => sum + p.gratuite_quantity, 0)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t('promos.table')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right font-bold">#</TableHead>
                  <TableHead className="text-right font-bold">{t('common.name')}</TableHead>
                  <TableHead className="text-right font-bold">{t('common.address')}</TableHead>
                  <TableHead className="text-right font-bold">{t('customers.wilaya')}</TableHead>
                  <TableHead className="text-right font-bold">{t('common.phone')}</TableHead>
                  <TableHead className="text-right font-bold">{t('products.name')}</TableHead>
                  <TableHead className="text-center font-bold">{t('promos.sales')}</TableHead>
                  <TableHead className="text-center font-bold">{t('promos.free')}</TableHead>
                  <TableHead className="text-right font-bold">{t('orders.worker')}</TableHead>
                  <TableHead className="text-right font-bold">{t('common.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPromos.map((promo, index) => (
                  <TableRow key={promo.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{(currentPage - 1) * pageSize + index + 1}</TableCell>
                    <TableCell className="font-medium">{promo.customer?.name || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{promo.customer?.address || '-'}</TableCell>
                    <TableCell className="text-sm">{promo.customer?.wilaya || '-'}</TableCell>
                    <TableCell className="text-sm" dir="ltr">{promo.customer?.phone || '-'}</TableCell>
                    <TableCell className="font-medium">{promo.product?.name || '-'}</TableCell>
                    <TableCell className="text-center">
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded font-bold">
                        {promo.vente_quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="bg-accent/50 text-accent-foreground px-2 py-1 rounded font-bold">
                        {promo.gratuite_quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{promo.worker?.full_name || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(promo.promo_date), 'dd/MM/yyyy', { locale: getDateLocale(language) })}
                    </TableCell>
                  </TableRow>
                ))}

                {filteredPromos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {t('common.no_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {filteredPromos.length > pageSize && (
        <div className="no-print">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.max(1, p - 1));
                  }}
                  className={cn(currentPage === 1 && 'pointer-events-none opacity-50')}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => {
                // For simplicity: show first 7 pages (enough for most cases). Can be enhanced later.
                const page = i + 1;
                return (
                  <PaginationItem key={page}>
                    <PaginationLink
                      href="#"
                      isActive={page === currentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(page);
                      }}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              {totalPages > 7 && (
                <PaginationItem>
                  <span className="px-2 text-sm text-muted-foreground">
                    ... ({currentPage}/{totalPages})
                  </span>
                </PaginationItem>
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                  }}
                  className={cn(currentPage === totalPages && 'pointer-events-none opacity-50')}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};

export default PromoTable;