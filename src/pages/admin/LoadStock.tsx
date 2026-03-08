import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Loader2, Trash2, Truck, AlertTriangle, Package, CheckCircle, PackageX, User, ChevronDown, Gift, Save, History, X, CalendarIcon, Search, RefreshCw, UserCheck, ShoppingCart, Printer } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WorkerPickerDialog from '@/components/stock/WorkerPickerDialog';
import ProductPickerDialog from '@/components/stock/ProductPickerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useWorkerLoadSuggestions, useStockAlerts } from '@/hooks/useStockAlerts';
import { useLoadingSessions } from '@/hooks/useLoadingSessions';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useCreateDiscrepancy } from '@/hooks/useStockDiscrepancies';
import StockVerificationDialog from '@/components/stock/StockVerificationDialog';
import ExchangeSessionDialog from '@/components/stock/ExchangeSessionDialog';
import CustomerPickerDialog from '@/components/orders/CustomerPickerDialog';
import PartialLoadFromOrdersDialog from '@/components/stock/PartialLoadFromOrdersDialog';
import WorkerLoadRequestBanner from '@/components/stock/WorkerLoadRequestBanner';
import LoadSheetPrintView from '@/components/stock/LoadSheetPrintView';
import SessionPrintView from '@/components/stock/SessionPrintView';
import { Customer, Sector } from '@/types/database';

interface EmptyTruckItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  pendingNeeded: number;
  returnQty: number;
  piecesPerBox: number;
  keepAllocations: { reason: string; quantity: number }[];
  allocationMode: boolean;
  surplusQty: number;
  actualQty: number; // actual physical count
  verificationStatus: 'equivalent' | 'surplus' | 'deficit' | 'unverified';
}

const KEEP_REASONS = ['cash_sale', 'offer_gifts', 'reserve', 'other'] as const;
/**
 * Custom quantity format: whole part = boxes, decimal part = pieces (padded to 2 digits).
 * e.g., 982.02 = 982 boxes + 2 pieces, 13.18 = 13 boxes + 18 pieces.
 * This is NOT a mathematical fraction - it's a notation.
 */

/** Convert custom format (boxes.pieces) to total pieces */
const customToTotalPieces = (customQty: number, piecesPerBox: number): number => {
  const boxes = Math.floor(Math.round(customQty * 100) / 100);
  const decimalPart = Math.round((Math.round(customQty * 100) / 100 - boxes) * 100);
  return boxes * piecesPerBox + decimalPart;
};

/** Convert total pieces to custom format (boxes.pieces) */
const totalPiecesToCustom = (totalPieces: number, piecesPerBox: number): number => {
  const boxes = Math.floor(totalPieces / piecesPerBox);
  const remainingPieces = Math.round(totalPieces % piecesPerBox);
  return boxes + remainingPieces / 100;
};

/** Subtract quantities in custom format via piece conversion */
const subtractCustomQty = (from: number, amount: number, piecesPerBox: number): number => {
  const fromPieces = customToTotalPieces(from, piecesPerBox);
  const amountPieces = customToTotalPieces(amount, piecesPerBox);
  return totalPiecesToCustom(fromPieces - amountPieces, piecesPerBox);
};

/** Add quantities in custom format via piece conversion */
const addCustomQty = (base: number, amount: number, piecesPerBox: number): number => {
  const basePieces = customToTotalPieces(base, piecesPerBox);
  const amountPieces = customToTotalPieces(amount, piecesPerBox);
  return totalPiecesToCustom(basePieces + amountPieces, piecesPerBox);
};

/** Format quantity for display */
const fmtQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const LoadStock: React.FC = () => {
  const { t } = useLanguage();
  const { workerId: currentWorkerId } = useAuth();
  const queryClient = useQueryClient();
  const { warehouseStock, workers, products, loadToWorker, isLoading, branchId, refresh } = useWarehouseStock();
  const [searchParams] = useSearchParams();

  const { workerId: contextWorkerId } = useSelectedWorker();
  const [selectedWorker, setSelectedWorker] = useState(() => contextWorkerId || '');
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [showPartialLoadDialog, setShowPartialLoadDialog] = useState(false);
  const [showLoadSheetPrint, setShowLoadSheetPrint] = useState(false);

  // Auto-open history from URL params
  useEffect(() => {
    if (searchParams.get('history') === '1' && selectedWorker) {
      setShowSessionHistory(true);
    }
  }, [searchParams, selectedWorker]);
  const [printSessionId, setPrintSessionId] = useState<string | null>(null);
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);
  const [viewSessionItems, setViewSessionItems] = useState<any[]>([]);
  const [viewReviewDiscrepancies, setViewReviewDiscrepancies] = useState<any[]>([]);
  const [isLoadingViewItems, setIsLoadingViewItems] = useState(false);
  // Session history filters
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [historyProductFilter, setHistoryProductFilter] = useState<string>('');
  const [sessionProductMap, setSessionProductMap] = useState<Record<string, string[]>>({});
  const [sessionDiscrepancyMap, setSessionDiscrepancyMap] = useState<Record<string, { deficit: number; surplus: number }>>({});
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [emptyTruckItems, setEmptyTruckItems] = useState<EmptyTruckItem[]>([]);
  const [isEmptying, setIsEmptying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Add product dialog state
  const [addProductId, setAddProductId] = useState('');
  const [addProductQty, setAddProductQty] = useState(1);
  const [addProductGiftQty, setAddProductGiftQty] = useState(0);
  const [addProductGiftUnit, setAddProductGiftUnit] = useState('piece');
  const [addProductIsCustomLoad, setAddProductIsCustomLoad] = useState(false);
  const [addProductCustomLoadNote, setAddProductCustomLoadNote] = useState('');
  const [addProductCustomerId, setAddProductCustomerId] = useState<string | null>(null);
  const [addProductCustomerName, setAddProductCustomerName] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // Customers & sectors for customer picker
  const { data: customersData = [] } = useQuery({
    queryKey: ['customers-for-load', branchId],
    queryFn: async () => {
      let q = supabase.from('customers').select('*').eq('status', 'active');
      if (branchId) q = q.eq('branch_id', branchId);
      const { data } = await q.order('name');
      return (data || []) as Customer[];
    },
  });
  const { data: sectorsData = [] } = useQuery({
    queryKey: ['sectors-for-load', branchId],
    queryFn: async () => {
      let q = supabase.from('sectors').select('*');
      if (branchId) q = q.eq('branch_id', branchId);
      const { data } = await q.order('name');
      return (data || []) as Sector[];
    },
  });

  // Product surplus from stock_discrepancies
  const [productSurplus, setProductSurplus] = useState(0);
  useEffect(() => {
    if (!addProductId || !addProductIsCustomLoad || !branchId) { setProductSurplus(0); return; }
    const fetchSurplus = async () => {
      const { data } = await supabase
        .from('stock_discrepancies')
        .select('remaining_quantity')
        .eq('product_id', addProductId)
        .eq('discrepancy_type', 'surplus')
        .eq('status', 'pending');
      const total = (data || []).reduce((s: number, d: any) => s + (d.remaining_quantity || 0), 0);
      setProductSurplus(total);
    };
    fetchSurplus();
  }, [addProductId, addProductIsCustomLoad, branchId]);

  // Current session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<any[]>([]);

  // Edit session item state
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editGiftQty, setEditGiftQty] = useState(0);
  const [editGiftUnit, setEditGiftUnit] = useState('piece');
  const [isEditSaving, setIsEditSaving] = useState(false);

  const { data: stockAlerts = [] } = useStockAlerts();
  const { data: suggestions = [], isLoading: suggestionsLoading } = useWorkerLoadSuggestions(selectedWorker || null);
  const createDiscrepancy = useCreateDiscrepancy();
  const {
    sessions, createSession, addSessionItem, completeSession, deleteSession,
    deleteSessionItem, sessionItemsQuery, refetch: refetchSessions,
  } = useLoadingSessions(selectedWorker || null);

  // Fetch total loaded quantities from the LAST loading session for the selected worker
  const { data: workerLoadedData } = useQuery({
    queryKey: ['worker-last-session-loaded', selectedWorker],
    queryFn: async () => {
      const { data: lastSession } = await supabase
        .from('loading_sessions')
        .select('id')
        .eq('worker_id', selectedWorker!)
        .in('status', ['completed', 'open'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!lastSession) return {};

      const { data: items } = await supabase
        .from('loading_session_items')
        .select('product_id, quantity, gift_quantity, previous_quantity')
        .eq('session_id', lastSession.id);

      const totals: Record<string, number> = {};
      for (const item of (items || [])) {
        totals[item.product_id] = (totals[item.product_id] || 0) + (item.previous_quantity || 0) + item.quantity + (item.gift_quantity || 0);
      }
      return totals;
    },
    enabled: !!selectedWorker,
  });

  // Fetch total loaded since last completed accounting session (all sessions combined)
  const { data: workerLoadedSinceAccounting } = useQuery({
    queryKey: ['worker-loaded-since-accounting', selectedWorker],
    queryFn: async () => {
      // Get last completed accounting session date
      const { data: lastAccounting } = await supabase
        .from('accounting_sessions')
        .select('completed_at')
        .eq('worker_id', selectedWorker!)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();
      const sinceDate = lastAccounting?.completed_at || null;

      // Get all loading sessions since last accounting (completed or open, exclude review)
      let sessionsQ = supabase
        .from('loading_sessions')
        .select('id')
        .eq('worker_id', selectedWorker!)
        .in('status', ['completed', 'open']);
      if (sinceDate) sessionsQ = sessionsQ.gte('created_at', sinceDate);
      const { data: loadSessions } = await sessionsQ;
      if (!loadSessions || loadSessions.length === 0) return {};

      const sessionIds = loadSessions.map(s => s.id);
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('product_id, quantity, gift_quantity')
        .in('session_id', sessionIds);

      const totals: Record<string, number> = {};
      for (const item of (items || [])) {
        totals[item.product_id] = (totals[item.product_id] || 0) + item.quantity + (item.gift_quantity || 0);
      }
      return totals;
    },
    enabled: !!selectedWorker,
  });

  // Fetch accounting sessions for this worker (for red badge separator in history)
  const { data: accountingSessions = [] } = useQuery({
    queryKey: ['worker-accounting-sessions-history', selectedWorker],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounting_sessions')
        .select('completed_at')
        .eq('worker_id', selectedWorker!)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50);
      return (data || []).filter(a => a.completed_at);
    },
    enabled: !!selectedWorker,
  });

  // Check if the last session is a review - review must separate load/unload sessions
  const hasReviewToday = useMemo(() => {
    if (sessions.length === 0) return true; // No sessions = allow first load
    // Sessions are ordered by created_at DESC, so first is the latest
    const lastSession = sessions[0];
    // If last session is review, allow load/unload
    if (lastSession.status === 'review') return true;
    // If last session is open (active loading), allow (it's in progress)
    if (lastSession.status === 'open') return true;
    // If last session is exchange, allow (exchange doesn't affect review requirement)
    if (lastSession.status === 'exchange') return true;
    // Last session is loading (completed) or unloaded → require review first
    return false;
  }, [sessions]);


  // Product offers cache (with all tiers for dynamic calc)
  const [productOffers, setProductOffers] = useState<Record<string, { offerName: string; giftQty: number; giftUnit: string; minQty: number; minUnit: string; tiers: { minQty: number; maxQty: number | null; giftQty: number; giftUnit: string }[] }>>({});

  // Product group map
  const [productGroupMap, setProductGroupMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const fetchGroups = async () => {
      const { data: mappings } = await supabase
        .from('product_pricing_groups')
        .select('product_id, group:pricing_groups(name)');
      if (mappings) {
        const map: Record<string, string> = {};
        for (const m of mappings) map[m.product_id] = (m.group as any)?.name || '';
        setProductGroupMap(map);
      }
    };
    fetchGroups();
  }, []);

  const allProductOptions = useMemo(() => {
    const options: { id: string; name: string; warehouseQty: number; groupName?: string; image_url?: string | null }[] = [];
    const seenIds = new Set<string>();
    for (const s of warehouseStock) {
      if (s.product) {
        options.push({ id: s.product_id, name: s.product.name, warehouseQty: s.quantity, groupName: productGroupMap[s.product_id], image_url: (s.product as any).image_url });
        seenIds.add(s.product_id);
      }
    }
    for (const p of products) {
      if (!seenIds.has(p.id)) {
        options.push({ id: p.id, name: p.name, warehouseQty: 0, groupName: productGroupMap[p.id], image_url: (p as any).image_url });
        seenIds.add(p.id);
      }
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [warehouseStock, products, productGroupMap]);

  const buildReviewDiscrepanciesFromItems = (reviewItems: any[]) => {
    return reviewItems
      .map((item: any) => {
        const previous = Number(item.previous_quantity ?? 0);
        const actual = Number(item.quantity ?? 0);
        const rawDiff = Number((actual - previous).toFixed(2));
        const note = String(item.notes || '').trim();

        let discrepancyType: 'deficit' | 'surplus' | null = null;
        if (note.startsWith('عجز')) discrepancyType = 'deficit';
        else if (note.startsWith('فائض')) discrepancyType = 'surplus';
        else if (Math.abs(rawDiff) > 0.001) discrepancyType = rawDiff < 0 ? 'deficit' : 'surplus';

        if (!discrepancyType) return null;

        return {
          id: `fallback-${item.id}`,
          product_id: item.product_id,
          discrepancy_type: discrepancyType,
          quantity: Math.abs(rawDiff),
          product: item.product,
          created_at: item.created_at,
        };
      })
      .filter(Boolean) as any[];
  };

  // View session details handler
  const handleViewSession = async (sessionId: string) => {
    setViewSessionId(sessionId);
    setIsLoadingViewItems(true);
    setViewReviewDiscrepancies([]);

    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('loading_session_items')
        .select('*, product:products(name, pieces_per_box)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      const reviewItems = itemsData || [];
      setViewSessionItems(reviewItems);
      const fallbackDiscrepancies = buildReviewDiscrepanciesFromItems(reviewItems);

      let sessionStatus = sessions.find(s => s.id === sessionId)?.status;
      if (!sessionStatus) {
        const { data: sessionData } = await supabase
          .from('loading_sessions')
          .select('status')
          .eq('id', sessionId)
          .maybeSingle();
        sessionStatus = sessionData?.status || undefined;
      }

      if (sessionStatus === 'review') {
        const { data: discData, error: discError } = await supabase
          .from('stock_discrepancies')
          .select('*, product:products(name, pieces_per_box)')
          .eq('source_session_id', sessionId)
          .order('created_at', { ascending: true });


        if (!discError) {
          const databaseDiscrepancies = discData || [];
          if (databaseDiscrepancies.length === 0) {
            setViewReviewDiscrepancies(fallbackDiscrepancies);
          } else {
            const existingProductIds = new Set(databaseDiscrepancies.map((d: any) => d.product_id));
            const mergedDiscrepancies = [
              ...databaseDiscrepancies,
              ...fallbackDiscrepancies.filter((d: any) => !existingProductIds.has(d.product_id)),
            ];
            setViewReviewDiscrepancies(mergedDiscrepancies);
          }
        } else {
          console.error('Error loading review discrepancies, using fallback:', discError);
          setViewReviewDiscrepancies(fallbackDiscrepancies);
        }
      } else {
        setViewReviewDiscrepancies(fallbackDiscrepancies);
      }
    } catch (err) {
      console.error('Error loading session items:', err);
    } finally {
      setIsLoadingViewItems(false);
    }
  };

  // Fetch product IDs + discrepancy counts per session when history opens
  useEffect(() => {
    if (!showSessionHistory) return;
    if (sessions.length === 0) {
      setSessionProductMap({});
      setSessionDiscrepancyMap({});
      return;
    }

    const fetchSessionProducts = async () => {
      const sessionIds = sessions.map(s => s.id);

      const { data: itemsData } = await supabase
        .from('loading_session_items')
        .select('session_id, product_id, notes, quantity, previous_quantity')
        .in('session_id', sessionIds);

      const productMap: Record<string, string[]> = {};
      const fallbackDiscrepancyMap: Record<string, { deficit: number; surplus: number }> = {};

      (itemsData || []).forEach((item: any) => {
        if (!productMap[item.session_id]) productMap[item.session_id] = [];
        if (!productMap[item.session_id].includes(item.product_id)) {
          productMap[item.session_id].push(item.product_id);
        }

        const note = String(item.notes || '').trim();
        const diff = Number((Number(item.quantity || 0) - Number(item.previous_quantity || 0)).toFixed(2));

        let discrepancyType: 'deficit' | 'surplus' | null = null;
        if (note.startsWith('عجز')) discrepancyType = 'deficit';
        else if (note.startsWith('فائض')) discrepancyType = 'surplus';
        else if (Math.abs(diff) > 0.001) discrepancyType = diff < 0 ? 'deficit' : 'surplus';

        if (discrepancyType) {
          if (!fallbackDiscrepancyMap[item.session_id]) {
            fallbackDiscrepancyMap[item.session_id] = { deficit: 0, surplus: 0 };
          }
          fallbackDiscrepancyMap[item.session_id][discrepancyType] += 1;
        }
      });

      setSessionProductMap(productMap);

      const { data: discrepanciesData } = await supabase
        .from('stock_discrepancies')
        .select('source_session_id, discrepancy_type')
        .in('source_session_id', sessionIds);

      const dbDiscrepancyMap: Record<string, { deficit: number; surplus: number }> = {};
      (discrepanciesData || []).forEach((disc: any) => {
        const sessionId = disc.source_session_id;
        if (!sessionId) return;
        if (!dbDiscrepancyMap[sessionId]) {
          dbDiscrepancyMap[sessionId] = { deficit: 0, surplus: 0 };
        }
        if (disc.discrepancy_type === 'deficit') dbDiscrepancyMap[sessionId].deficit += 1;
        if (disc.discrepancy_type === 'surplus') dbDiscrepancyMap[sessionId].surplus += 1;
      });

      const mergedDiscrepancyMap: Record<string, { deficit: number; surplus: number }> = {};
      sessionIds.forEach((sessionId) => {
        const dbCounts = dbDiscrepancyMap[sessionId] || { deficit: 0, surplus: 0 };
        const fallbackCounts = fallbackDiscrepancyMap[sessionId] || { deficit: 0, surplus: 0 };

        mergedDiscrepancyMap[sessionId] = {
          deficit: Math.max(dbCounts.deficit, fallbackCounts.deficit),
          surplus: Math.max(dbCounts.surplus, fallbackCounts.surplus),
        };
      });

      setSessionDiscrepancyMap(mergedDiscrepancyMap);
    };

    fetchSessionProducts();
  }, [showSessionHistory, sessions]);

  // Filtered sessions for history
  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (historyDateFilter) {
      const filterDateStr = format(historyDateFilter, 'yyyy-MM-dd');
      result = result.filter(s => s.created_at.startsWith(filterDateStr));
    }
    if (historyProductFilter) {
      result = result.filter(s => {
        const productIds = sessionProductMap[s.id] || [];
        return productIds.includes(historyProductFilter);
      });
    }
    return result;
  }, [sessions, historyDateFilter, historyProductFilter, sessionProductMap]);

  // Get unique products from all sessions for filter dropdown
  const sessionProductOptions = useMemo(() => {
    const productIds = new Set<string>();
    Object.values(sessionProductMap).forEach(ids => ids.forEach(id => productIds.add(id)));
    return Array.from(productIds).map(id => {
      const p = products.find(pr => pr.id === id);
      return { id, name: p?.name || id };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionProductMap, products]);

  // Reset on worker change
  useEffect(() => {
    setActiveSessionId(null);
    setSessionItems([]);
  }, [selectedWorker]);

  // Load active session items
  useEffect(() => {
    if (!activeSessionId) { setSessionItems([]); return; }
    const load = async () => {
      const { data } = await sessionItemsQuery(activeSessionId);
      setSessionItems(data || []);
    };
    load();
  }, [activeSessionId]);

  // Auto-create or resume open session when worker selected
  useEffect(() => {
    if (selectedWorker && sessions.length > 0) {
      const openSession = sessions.find(s => s.status === 'open');
      if (openSession) setActiveSessionId(openSession.id);
    }
  }, [selectedWorker, sessions]);

  const getAvailableQuantity = (productId: string) =>
    warehouseStock.find(s => s.product_id === productId)?.quantity || 0;

  const fetchProductOffer = async (productId: string) => {
    if (productOffers[productId]) return productOffers[productId];
    const { data: offers } = await supabase
      .from('product_offers')
      .select('id, name')
      .eq('product_id', productId)
      .eq('is_active', true)
      .limit(1);
    if (!offers || offers.length === 0) return null;
    const { data: tiers } = await supabase
      .from('product_offer_tiers')
      .select('min_quantity, max_quantity, min_quantity_unit, gift_quantity, gift_quantity_unit, gift_type')
      .eq('offer_id', offers[0].id)
      .eq('gift_type', 'same_product')
      .order('tier_order', { ascending: true });
    if (!tiers || tiers.length === 0) return null;
    const firstTier = tiers[0];
    const offer = {
      offerName: offers[0].name,
      giftQty: firstTier.gift_quantity,
      giftUnit: firstTier.gift_quantity_unit || 'piece',
      minQty: firstTier.min_quantity,
      minUnit: firstTier.min_quantity_unit || 'piece',
      tiers: tiers.map(t => ({
        minQty: t.min_quantity,
        maxQty: t.max_quantity,
        giftQty: t.gift_quantity,
        giftUnit: t.gift_quantity_unit || 'piece',
      })),
    };
    setProductOffers(prev => ({ ...prev, [productId]: offer }));
    return offer;
  };

  // Calculate suggested gift quantity (read-only suggestion, NOT auto-applied)
  const [suggestedGiftQty, setSuggestedGiftQty] = useState(0);
  const [suggestedGiftUnit, setSuggestedGiftUnit] = useState('piece');
  useEffect(() => {
    if (!addProductId || addProductQty <= 0) { setSuggestedGiftQty(0); return; }
    const offer = productOffers[addProductId];
    if (!offer) { setSuggestedGiftQty(0); return; }

    let totalGifts = 0;
    const qty = addProductQty;
    const sortedTiers = [...offer.tiers].sort((a, b) => b.minQty - a.minQty);
    for (const tier of sortedTiers) {
      if (qty >= tier.minQty) {
        totalGifts = Math.floor(qty / tier.minQty) * tier.giftQty;
        setSuggestedGiftUnit(tier.giftUnit);
        break;
      }
    }
    setSuggestedGiftQty(totalGifts);
    // Do NOT auto-set addProductGiftQty - user must click to apply
  }, [addProductQty, addProductId, productOffers]);

  // Auto-calculate gift quantity when edit qty changes
  useEffect(() => {
    if (!editingItem || editQty <= 0) return;
    const offer = productOffers[editingItem.product_id];
    if (!offer) return;

    let totalGifts = 0;
    const qty = editQty;
    const sortedTiers = [...offer.tiers].sort((a, b) => b.minQty - a.minQty);
    for (const tier of sortedTiers) {
      if (qty >= tier.minQty) {
        totalGifts = Math.floor(qty / tier.minQty) * tier.giftQty;
        setEditGiftUnit(tier.giftUnit);
        break;
      }
    }
    setEditGiftQty(totalGifts);
  }, [editQty, editingItem, productOffers]);

  // Start new session
  const handleStartSession = async () => {
    if (!selectedWorker) { toast.error(t('stock.select_worker')); return; }
    if (!hasReviewToday) {
      toast.error('يجب إجراء جلسة مراجعة أولاً قبل بدء الشحن');
      setShowVerificationDialog(true);
      return;
    }
    try {
      const result = await createSession.mutateAsync({ workerId: selectedWorker });
      setActiveSessionId(result.id);
      toast.success('تم بدء جلسة شحن جديدة');
    } catch (err: any) { toast.error(err.message); }
  };

  // Open add product dialog
  const handleOpenAddProduct = () => {
    setAddProductId('');
    setAddProductQty(1);
    setAddProductGiftQty(0);
    setAddProductGiftUnit('piece');
    setAddProductIsCustomLoad(false);
    setAddProductCustomLoadNote('');
    setAddProductCustomerId(null);
    setAddProductCustomerName('');
    setShowProductPicker(true);
  };

  // When product selected from picker
  const handleProductSelected = async (productId: string) => {
    setAddProductId(productId);
    setShowProductPicker(false);

    // Auto-fill suggested quantity
    const suggestion = suggestions.find(s => s.product_id === productId);
    if (suggestion && suggestion.suggested_load > 0) {
      setAddProductQty(suggestion.suggested_load);
    } else {
      setAddProductQty(1);
    }

    // Fetch offer data (gift calc is handled by useEffect)
    await fetchProductOffer(productId);

    setShowAddProductDialog(true);
  };

  // Confirm add single product to session
  const handleAddProductToSession = async () => {
    if (!activeSessionId || !addProductId || addProductQty <= 0) return;
    setIsSaving(true);
    try {
      const product = products.find(p => p.id === addProductId);
      const piecesPerBox = product?.pieces_per_box || 20;
      let totalLoadQty = addProductQty;

      // Convert gift pieces to custom format and add
      if (addProductGiftQty > 0) {
        const giftInCustom = addProductGiftUnit === 'piece' 
          ? totalPiecesToCustom(addProductGiftQty, piecesPerBox) 
          : addProductGiftQty;
        totalLoadQty = addCustomQty(totalLoadQty, giftInCustom, piecesPerBox);
      }

      // Direct stock operations without full reload
      const warehouseItem = warehouseStock.find(s => s.product_id === addProductId);
      if (!warehouseItem) {
        throw new Error(`الكمية المتاحة من ${product?.name || ''} غير كافية`);
      }
      
      // Compare in total pieces
      const warehousePieces = customToTotalPieces(warehouseItem.quantity, piecesPerBox);
      const loadPieces = customToTotalPieces(totalLoadQty, piecesPerBox);
      if (warehousePieces < loadPieces) {
        throw new Error(`الكمية المتاحة من ${product?.name || ''} غير كافية`);
      }

      // Deduct from warehouse using piece-based math
      const newWarehouseQty = subtractCustomQty(warehouseItem.quantity, totalLoadQty, piecesPerBox);
      await supabase
        .from('warehouse_stock')
        .update({ quantity: newWarehouseQty })
        .eq('id', warehouseItem.id);

      // Add to worker stock using piece-based math
      const { data: existingWS } = await supabase
        .from('worker_stock')
        .select('id, quantity')
        .eq('worker_id', selectedWorker)
        .eq('product_id', addProductId)
        .maybeSingle();

      if (existingWS) {
        const newWorkerQty = addCustomQty(existingWS.quantity, totalLoadQty, piecesPerBox);
        await supabase
          .from('worker_stock')
          .update({ quantity: newWorkerQty })
          .eq('id', existingWS.id);
      } else {
        await supabase.from('worker_stock').insert({
          worker_id: selectedWorker,
          product_id: addProductId,
          branch_id: branchId,
          quantity: totalLoadQty,
        });
      }

      // Movement record
      await supabase.from('stock_movements').insert({
        product_id: addProductId,
        branch_id: branchId,
        quantity: totalLoadQty,
        movement_type: 'load',
        status: 'approved',
        created_by: currentWorkerId,
        worker_id: selectedWorker,
        notes: `شحن من جلسة - ${product?.name || ''}`,
      });

      // Save to session (include previous worker stock balance)
      const previousWorkerQty = existingWS ? existingWS.quantity : 0;
      await addSessionItem.mutateAsync({
        sessionId: activeSessionId,
        productId: addProductId,
        quantity: addProductQty,
        giftQuantity: addProductGiftQty,
        giftUnit: addProductGiftUnit,
        notes: product?.name || '',
        isCustomLoad: addProductIsCustomLoad,
        customLoadNote: addProductIsCustomLoad ? (addProductCustomerName || addProductCustomLoadNote) : undefined,
        previousQuantity: previousWorkerQty,
      });

      // Refresh session items only
      const { data } = await sessionItemsQuery(activeSessionId);
      setSessionItems(data || []);

      // Targeted invalidation - realtime handles warehouse/worker stock
      queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });

      toast.success(`تم شحن ${product?.name || ''} بنجاح`);
      setShowAddProductDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Remove item from session (reverse stock)
  const handleRemoveSessionItem = async (item: any) => {
    try {
      await deleteSessionItem.mutateAsync({
        itemId: item.id,
        productId: item.product_id,
        quantity: item.quantity,
        giftQuantity: item.gift_quantity || 0,
      });
      const { data } = await sessionItemsQuery(activeSessionId!);
      setSessionItems(data || []);
      await refresh();
      toast.success('تم حذف المنتج واسترجاع الرصيد');
    } catch (err: any) { toast.error(err.message); }
  };

  // Open edit dialog for session item
  const handleEditSessionItem = async (item: any) => {
    setEditingItem(item);
    setEditQty(item.quantity);
    setEditGiftQty(item.gift_quantity || 0);
    setEditGiftUnit(item.gift_unit || 'piece');
    // Fetch offer data so dynamic gift calc works
    await fetchProductOffer(item.product_id);
  };

  // Save edited session item
  const handleSaveEditItem = async () => {
    if (!editingItem || !activeSessionId || !branchId || !selectedWorker) return;
    setIsEditSaving(true);
    try {
      const product = products.find(p => p.id === editingItem.product_id);
      const piecesPerBox = product?.pieces_per_box || 20;
      const oldQty = editingItem.quantity;
      const oldGiftQty = editingItem.gift_quantity || 0;
      const oldGiftUnit = editingItem.gift_unit || 'piece';
      const oldGiftInCustom = oldGiftUnit === 'box' ? oldGiftQty : totalPiecesToCustom(oldGiftQty, piecesPerBox);
      const oldTotalLoad = oldGiftQty > 0 ? addCustomQty(oldQty, oldGiftInCustom, piecesPerBox) : oldQty;

      const newGiftInCustom = editGiftUnit === 'box' ? editGiftQty : totalPiecesToCustom(editGiftQty, piecesPerBox);
      const newTotalLoad = editGiftQty > 0 ? addCustomQty(editQty, newGiftInCustom, piecesPerBox) : editQty;

      const diff = customToTotalPieces(newTotalLoad, piecesPerBox) - customToTotalPieces(oldTotalLoad, piecesPerBox);

      if (diff > 0) {
        // Need more from warehouse
        const diffCustom = totalPiecesToCustom(Math.abs(diff), piecesPerBox);
        const warehouseItem = warehouseStock.find(s => s.product_id === editingItem.product_id);
        if (!warehouseItem || customToTotalPieces(warehouseItem.quantity, piecesPerBox) < Math.abs(diff)) {
          toast.error('الكمية المتاحة في المخزن غير كافية');
          setIsEditSaving(false);
          return;
        }
        await supabase.from('warehouse_stock').update({ quantity: subtractCustomQty(warehouseItem.quantity, diffCustom, piecesPerBox) }).eq('id', warehouseItem.id);
        const { data: ws } = await supabase.from('worker_stock').select('id, quantity').eq('worker_id', selectedWorker).eq('product_id', editingItem.product_id).single();
        if (ws) await supabase.from('worker_stock').update({ quantity: addCustomQty(ws.quantity, diffCustom, piecesPerBox) }).eq('id', ws.id);
      } else if (diff < 0) {
        // Return to warehouse
        const diffCustom = totalPiecesToCustom(Math.abs(diff), piecesPerBox);
        const warehouseItem = warehouseStock.find(s => s.product_id === editingItem.product_id);
        if (warehouseItem) {
          await supabase.from('warehouse_stock').update({ quantity: addCustomQty(warehouseItem.quantity, diffCustom, piecesPerBox) }).eq('id', warehouseItem.id);
        } else {
          await supabase.from('warehouse_stock').insert({ branch_id: branchId, product_id: editingItem.product_id, quantity: diffCustom });
        }
        const { data: ws } = await supabase.from('worker_stock').select('id, quantity').eq('worker_id', selectedWorker).eq('product_id', editingItem.product_id).single();
        if (ws) await supabase.from('worker_stock').update({ quantity: subtractCustomQty(ws.quantity, diffCustom, piecesPerBox) }).eq('id', ws.id);
      }

      // Update session item
      await supabase.from('loading_session_items').update({
        quantity: editQty,
        gift_quantity: editGiftQty,
        gift_unit: editGiftUnit,
      }).eq('id', editingItem.id);

      const { data } = await sessionItemsQuery(activeSessionId);
      setSessionItems(data || []);
      // Update local warehouse stock without full page reload
      const { data: updatedWh } = await supabase.from('warehouse_stock').select('*').eq('branch_id', branchId);
      if (updatedWh) {
        // Trigger targeted refresh via queryClient only
        queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
        queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      }
      toast.success('تم تعديل الكمية بنجاح');
      setEditingItem(null);
    } catch (err: any) { toast.error(err.message); }
    finally { setIsEditSaving(false); }
  };

  // Handle partial load from orders - bulk add products to active session
  const handlePartialLoadConfirm = async (aggregatedProducts: { productId: string; productName: string; quantity: number; piecesPerBox: number }[]) => {
    if (!activeSessionId || aggregatedProducts.length === 0) return;
    setIsSaving(true);
    try {
      for (const p of aggregatedProducts) {
        const piecesPerBox = p.piecesPerBox || 20;
        const totalLoadQty = p.quantity;

        // Check warehouse availability
        const warehouseItem = warehouseStock.find(s => s.product_id === p.productId);
        if (!warehouseItem) {
          toast.error(`الكمية المتاحة من ${p.productName} غير كافية — تم تخطيه`);
          continue;
        }
        const warehousePieces = customToTotalPieces(warehouseItem.quantity, piecesPerBox);
        const loadPieces = customToTotalPieces(totalLoadQty, piecesPerBox);
        if (warehousePieces < loadPieces) {
          toast.error(`الكمية المتاحة من ${p.productName} غير كافية — تم تخطيه`);
          continue;
        }

        // Deduct from warehouse
        const newWarehouseQty = subtractCustomQty(warehouseItem.quantity, totalLoadQty, piecesPerBox);
        await supabase.from('warehouse_stock').update({ quantity: newWarehouseQty }).eq('id', warehouseItem.id);
        // Update local ref for next iteration
        warehouseItem.quantity = newWarehouseQty;

        // Add to worker stock
        const { data: existingWS } = await supabase
          .from('worker_stock')
          .select('id, quantity')
          .eq('worker_id', selectedWorker)
          .eq('product_id', p.productId)
          .maybeSingle();

        const previousWorkerQty = existingWS ? existingWS.quantity : 0;

        if (existingWS) {
          const newWorkerQty = addCustomQty(existingWS.quantity, totalLoadQty, piecesPerBox);
          await supabase.from('worker_stock').update({ quantity: newWorkerQty }).eq('id', existingWS.id);
        } else {
          await supabase.from('worker_stock').insert({
            worker_id: selectedWorker,
            product_id: p.productId,
            branch_id: branchId,
            quantity: totalLoadQty,
          });
        }

        // Stock movement record
        await supabase.from('stock_movements').insert({
          product_id: p.productId,
          branch_id: branchId,
          quantity: totalLoadQty,
          movement_type: 'load',
          status: 'approved',
          created_by: currentWorkerId,
          worker_id: selectedWorker,
          notes: `شحن جزئي من الطلبيات - ${p.productName}`,
        });

        // Save to session
        await addSessionItem.mutateAsync({
          sessionId: activeSessionId,
          productId: p.productId,
          quantity: p.quantity,
          giftQuantity: 0,
          giftUnit: 'piece',
          notes: `شحن من طلبيات - ${p.productName}`,
          previousQuantity: previousWorkerQty,
        });
      }

      // Refresh session items
      const { data } = await sessionItemsQuery(activeSessionId);
      setSessionItems(data || []);
      queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      toast.success(`تم شحن ${aggregatedProducts.length} منتج من الطلبيات بنجاح`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteSession = async () => {
    const sessionToComplete = activeSessionId || sessions.find(s => s.status === 'open')?.id;
    if (!sessionToComplete) { toast.error('لا توجد جلسة شحن مفتوحة'); return; }
    try {
      await completeSession.mutateAsync(sessionToComplete);
      toast.success('تم تأكيد جلسة الشحن بنجاح');
      setActiveSessionId(null);
      setSessionItems([]);
    } catch (err: any) { toast.error(err.message); }
  };

  // Delete entire session (reverse all stock)
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession.mutateAsync(sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setSessionItems([]);
      }
      await refresh();
      toast.success('تم حذف الجلسة واسترجاع الرصيد');
    } catch (err: any) { toast.error(err.message); }
  };

  const hasDeficit = suggestions.some(s => s.suggested_load > 0);
  const totalDeficit = suggestions.reduce((sum, s) => sum + s.suggested_load, 0);
  const totalSessionQty = sessionItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalSessionGifts = sessionItems.reduce((s, i) => s + (i.gift_quantity || 0), 0);

  // Empty truck handler
  const handleEmptyTruckPreview = async () => {
    if (!selectedWorker || !branchId || !currentWorkerId) return;
    if (!hasReviewToday) {
      toast.error('يجب إجراء جلسة مراجعة أولاً قبل التفريغ');
      setShowVerificationDialog(true);
      return;
    }
    const { data: workerStock } = await supabase
      .from('worker_stock')
      .select('id, product_id, quantity, product:products(name)')
      .eq('worker_id', selectedWorker)
      .gt('quantity', 0);
    if (!workerStock || workerStock.length === 0) { toast.error(t('stock.empty_truck_nothing')); return; }
    const { data: orders } = await supabase
      .from('orders')
      .select('order_items:order_items(product_id, quantity)')
      .eq('assigned_worker_id', selectedWorker)
      .in('status', ['assigned', 'in_progress']);
    const pendingQty: Record<string, number> = {};
    for (const order of orders || []) {
      for (const item of (order as any).order_items || []) {
        pendingQty[item.product_id] = (pendingQty[item.product_id] || 0) + item.quantity;
      }
    }
    const itemsToReturn = workerStock
      .map(ws => {
        const product = products.find(p => p.id === ws.product_id);
        const piecesPerBox = product?.pieces_per_box || 20;
        const pending = pendingQty[ws.product_id] || 0;
        return {
          id: ws.id, product_id: ws.product_id,
          product_name: (ws.product as any)?.name || ws.product_id,
          quantity: ws.quantity, pendingNeeded: pending,
          returnQty: ws.quantity,
          piecesPerBox,
          keepAllocations: [] as { reason: string; quantity: number }[], allocationMode: false,
          surplusQty: 0,
          actualQty: ws.quantity, // default: system balance
          verificationStatus: 'unverified' as const,
        };
      });
    if (itemsToReturn.length === 0) { toast.error(t('stock.empty_truck_nothing')); return; }
    setEmptyTruckItems(itemsToReturn);
    setShowEmptyDialog(true);
  };

  const handleEmptyTruckConfirm = async () => {
    if (!branchId || !currentWorkerId) return;
    setIsEmptying(true);
    setShowEmptyDialog(false);
    try {
      const hasSurplus = emptyTruckItems.some(item => item.verificationStatus === 'surplus');
      const hasDeficitItems = emptyTruckItems.some(item => item.verificationStatus === 'deficit');
      const discrepancyNotes = hasSurplus ? ' (مع فائض)' : hasDeficitItems ? ' (مع عجز)' : '';

      // Build unloading details JSONB
      const unloadingDetails = emptyTruckItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        system_qty: item.quantity,
        actual_qty: item.actualQty,
        surplus_qty: item.verificationStatus === 'surplus' ? item.surplusQty : 0,
        deficit_qty: item.verificationStatus === 'deficit' ? item.quantity - item.actualQty : 0,
        status: item.verificationStatus,
      }));

      // Create an unloading session record
      const { data: unloadSession, error: sessionError } = await supabase
        .from('loading_sessions')
        .insert({
          worker_id: selectedWorker!,
          manager_id: currentWorkerId!,
          branch_id: branchId,
          status: 'unloaded',
          notes: `تفريغ الشاحنة${discrepancyNotes}`,
          completed_at: new Date().toISOString(),
          unloading_details: unloadingDetails,
        } as any)
        .select()
        .single();

      if (sessionError) throw sessionError;

      for (const item of emptyTruckItems) {
        const actualReturn = item.actualQty;
        if (actualReturn <= 0 && item.verificationStatus !== 'deficit') continue;

        const ppb = item.piecesPerBox;
        const surplusQty = item.verificationStatus === 'surplus' ? item.surplusQty : 0;
        const deficitQty = item.verificationStatus === 'deficit' 
          ? subtractCustomQty(item.quantity, item.actualQty, ppb) 
          : 0;

        // Save unloading session item
        await supabase.from('loading_session_items').insert({
          session_id: unloadSession.id,
          product_id: item.product_id,
          quantity: Math.min(actualReturn, item.quantity), // returnQty capped at system balance
          gift_quantity: 0,
          surplus_quantity: surplusQty,
          previous_quantity: item.quantity,
          notes: surplusQty > 0 ? `فائض: ${fmtQty(surplusQty)}` : deficitQty > 0 ? `عجز: ${fmtQty(deficitQty)}` : null,
        });

        // Record discrepancies
        if (item.verificationStatus === 'surplus' && surplusQty > 0) {
          await createDiscrepancy.mutateAsync({
            worker_id: selectedWorker!,
            product_id: item.product_id,
            branch_id: branchId,
            discrepancy_type: 'surplus',
            quantity: surplusQty,
            source_session_id: unloadSession.id,
            notes: `فائض أثناء التفريغ - ${item.product_name}`,
          });
        }
        if (item.verificationStatus === 'deficit' && deficitQty > 0) {
          await createDiscrepancy.mutateAsync({
            worker_id: selectedWorker!,
            product_id: item.product_id,
            branch_id: branchId,
            discrepancy_type: 'deficit',
            quantity: deficitQty,
            source_session_id: unloadSession.id,
            notes: `عجز أثناء التفريغ - ${item.product_name}`,
          });
        }

        // Deduct from worker stock (set to 0 since everything is returned/accounted for)
        await supabase.from('worker_stock').update({ quantity: 0 }).eq('id', item.id);
        
        // Add actual return to warehouse (including surplus)
        const totalToWarehouse = actualReturn;
        const existingWarehouse = warehouseStock.find(s => s.product_id === item.product_id);
        if (existingWarehouse) {
          const newWhQty = addCustomQty(existingWarehouse.quantity, totalToWarehouse, ppb);
          await supabase.from('warehouse_stock').update({ quantity: newWhQty }).eq('id', existingWarehouse.id);
        } else if (totalToWarehouse > 0) {
          await supabase.from('warehouse_stock').insert({ branch_id: branchId, product_id: item.product_id, quantity: totalToWarehouse });
        }
        
        const statusNote = item.verificationStatus === 'surplus' ? ` | فائض: ${fmtQty(surplusQty)}` : item.verificationStatus === 'deficit' ? ` | عجز: ${fmtQty(deficitQty)}` : '';
        await supabase.from('stock_movements').insert({
          product_id: item.product_id, branch_id: branchId, quantity: totalToWarehouse,
          movement_type: 'return', status: 'approved', created_by: currentWorkerId,
          worker_id: selectedWorker, notes: `تفريغ الشاحنة - ${item.product_name}${statusNote}`,
        });
      }
      setSessionItems([]);
      setActiveSessionId(null);
      await refresh();
      await refetchSessions();
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions', selectedWorker] });
      queryClient.invalidateQueries({ queryKey: ['loading-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['stock-discrepancies-pending'] });
      toast.success(t('stock.empty_truck_success'));
    } catch (error: any) { toast.error(error.message); }
    finally { setIsEmptying(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!branchId) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">{t('stock.load_to_worker')}</h2>
        <Card><CardContent className="py-6 text-center text-muted-foreground">{t('branches.select_branch')}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] min-h-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 space-y-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-bold flex-1">{t('stock.load_to_worker')}</h2>
          {selectedWorker && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-muted"
              onClick={() => setShowSessionHistory(true)}
            >
              <History className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}
        </div>

        {/* Worker Selection */}
        <button
          className="w-full flex items-center justify-between h-12 px-3 rounded-xl ring-1 ring-border/60 bg-card hover:bg-muted/30 active:scale-[0.99] transition-all"
          onClick={() => setShowWorkerPicker(true)}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium">{selectedWorker ? workers.find(w => w.id === selectedWorker)?.full_name : t('stock.select_worker')}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Stock Summary Collapsible */}
        {selectedWorker && !suggestionsLoading && suggestions.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl ring-1 ring-border/60 bg-card hover:bg-muted/30 active:scale-[0.99] transition-all">
                <div className="flex items-center gap-2">
                  {hasDeficit ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <CheckCircle className="w-4 h-4 text-green-600" />}
                  <span className="font-semibold text-[13px]">{hasDeficit ? t('stock.needs_loading') : t('stock.stock_sufficient')}</span>
                  {hasDeficit && <Badge variant="destructive" className="text-[10px] px-2 rounded-full">{totalDeficit} {t('stock.boxes')}</Badge>}
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid gap-1.5 max-h-[30dvh] overflow-y-auto">
                {suggestions.map(s => {
                  const sessionLoad = sessionItems.filter(si => si.product_id === s.product_id);
                  const loadedBoxes = sessionLoad.reduce((sum: number, si: any) => sum + (si.quantity || 0), 0);
                  const newGiftQty = sessionLoad.reduce((sum: number, si: any) => sum + (si.gift_quantity || 0), 0);
                  const newGiftUnit = sessionLoad[0]?.gift_unit || 'piece';
                  const product = products.find(p => p.id === s.product_id);
                  const piecesPerBox = product?.pieces_per_box || 20;
                  const giftInCustom = newGiftUnit === 'box' ? newGiftQty : totalPiecesToCustom(newGiftQty, piecesPerBox);
                  const totalNewLoaded = newGiftQty > 0 ? addCustomQty(loadedBoxes, giftInCustom, piecesPerBox) : loadedBoxes;
                  const oldStock = totalNewLoaded > 0 ? subtractCustomQty(s.current_stock, totalNewLoaded, piecesPerBox) : s.current_stock;
                  const surplus = Math.max(0, s.current_stock - s.pending_orders_quantity);
                  const newGiftInCustom = newGiftUnit === 'box' ? newGiftQty : totalPiecesToCustom(newGiftQty, piecesPerBox);
                  const totalGiftsCustom = newGiftInCustom;
                  const hasGifts = totalGiftsCustom > 0;
                  return (
                    <div key={s.product_id} className="rounded-xl ring-1 ring-border/40 bg-card p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-primary" />
                          <span className="font-semibold text-[12px]">{s.product_name}</span>
                        </div>
                        {s.suggested_load > 0 ? (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 rounded-full">يحتاج +{fmtQty(s.suggested_load)}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-full border-green-400 text-green-600">✓ كافي</Badge>
                        )}
                      </div>
                      <div className={`grid ${hasGifts ? 'grid-cols-8' : 'grid-cols-7'} gap-0.5 text-[10px]`}>
                        <div className="bg-muted/50 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">المتبقي</div>
                          <div className="font-bold">{fmtQty(oldStock)}</div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">شحن</div>
                          <div className="font-bold text-blue-600 dark:text-blue-400">{fmtQty((workerLoadedData || {})[s.product_id] || 0)}</div>
                        </div>
                        <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">بدون محاسبة</div>
                          <div className="font-bold text-orange-600 dark:text-orange-400">{fmtQty((workerLoadedSinceAccounting || {})[s.product_id] || 0)}</div>
                        </div>
                        <div className="bg-primary/5 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">جديد</div>
                          <div className="font-bold text-primary">{loadedBoxes > 0 ? `+${fmtQty(loadedBoxes)}` : '—'}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">الكلي</div>
                          <div className="font-bold">{fmtQty(s.current_stock)}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">طلبات</div>
                          <div className="font-bold">{fmtQty(s.pending_orders_quantity)}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-1 text-center">
                          <div className="text-muted-foreground text-[8px]">فائض</div>
                          <div className="font-bold">{fmtQty(surplus)}</div>
                        </div>
                        {hasGifts && (
                          <div className="bg-destructive/5 rounded-lg p-1 text-center">
                            <div className="text-muted-foreground text-[8px]">هدايا</div>
                            <div className="font-bold text-destructive">{fmtQty(totalGiftsCustom)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {suggestionsLoading && selectedWorker && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}

        {/* Session Status */}
        {activeSessionId && (
          <div className="flex items-center justify-between bg-primary/5 ring-1 ring-primary/20 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-medium text-[13px]">جلسة شحن نشطة</span>
              <Badge variant="secondary" className="text-[10px] rounded-full">{sessionItems.length} منتج</Badge>
              {totalSessionQty > 0 && <Badge className="text-[10px] rounded-full">{totalSessionQty} صندوق</Badge>}
            </div>
          </div>
        )}

        {/* Worker Load Request Banner */}
        {selectedWorker && (
          <WorkerLoadRequestBanner
            workerId={selectedWorker}
            activeSessionId={activeSessionId}
            onLoadProducts={(products) => handlePartialLoadConfirm(products)}
          />
        )}
      </div>

      {/* Scrollable Session Items */}
      <ScrollArea className="flex-1 px-3">
        {activeSessionId && sessionItems.length > 0 ? (
          <div className="space-y-1.5 pb-4 pt-1">
            {sessionItems.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl ring-1 ring-border/40 bg-card cursor-pointer hover:bg-muted/30 active:scale-[0.99] transition-all" onClick={() => handleEditSessionItem(item)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-medium text-[13px] truncate">{item.product?.name || item.notes || ''}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                    <span>الكمية: <strong>{fmtQty(item.quantity)}</strong></span>
                    {item.gift_quantity > 0 && (
                      <>
                        <span className="text-border">|</span>
                        <span className="text-destructive">هدايا: <strong>{fmtQty(item.gift_quantity)} {item.gift_unit === 'box' ? 'صندوق' : 'قطعة'}</strong></span>
                      </>
                    )}
                    {item.is_custom_load && (
                      <Badge className="bg-blue-500 text-white text-[9px] px-1.5 py-0 rounded-full">شحن مخصص</Badge>
                    )}
                  </div>
                  {item.is_custom_load && item.custom_load_note && (
                    <div className="text-[10px] text-blue-600 mt-0.5">{item.custom_load_note}</div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:bg-destructive/10 h-8 w-8 rounded-lg"
                  onClick={(e) => { e.stopPropagation(); handleRemoveSessionItem(item); }}
                  disabled={deleteSessionItem.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : activeSessionId ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <Package className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">لا توجد منتجات في الجلسة بعد</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">اضغط "إضافة منتج" لبدء الشحن</p>
          </div>
        ) : selectedWorker ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <Truck className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">ابدأ جلسة شحن جديدة</p>
          </div>
        ) : null}
      </ScrollArea>

      {/* Fixed Bottom Buttons */}
      {selectedWorker && (
        <div className="px-3 pt-2 pb-3 border-t bg-background space-y-2">
           {!activeSessionId ? (
            <>
              {!hasReviewToday && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 ring-1 ring-amber-200 dark:ring-amber-800 text-amber-700 dark:text-amber-400 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>يجب إجراء جلسة مراجعة قبل الشحن أو التفريغ</span>
                </div>
              )}
              <Button
                variant="outline"
                className={`w-full h-10 rounded-xl text-[13px] ${hasReviewToday 
                  ? "border-green-400 text-green-700 bg-green-50/50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20"
                  : "border-blue-400 text-blue-700 bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20"
                }`}
                onClick={() => setShowVerificationDialog(true)}
                disabled={isEmptying}
              >
                {hasReviewToday ? <CheckCircle className="w-4 h-4 me-1" /> : <Search className="w-4 h-4 me-1" />}
                {hasReviewToday ? 'تمت المراجعة ✓ (إعادة المراجعة)' : 'بدء جلسة مراجعة (إلزامي)'}
              </Button>
              <Button onClick={handleStartSession} className="w-full h-11 rounded-xl text-[13px] shadow-sm" disabled={createSession.isPending || !hasReviewToday}>
                {createSession.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                <Plus className="w-4 h-4 me-1" />
                بدء جلسة شحن جديدة
              </Button>
              <div className="grid grid-cols-4 gap-1.5">
                <Button variant="outline" onClick={() => setShowSessionHistory(true)} className="h-10 rounded-xl text-[11px] px-2">
                  <History className="w-3.5 h-3.5 me-1" />
                  سجل الجلسات
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl text-[11px] px-2 text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleEmptyTruckPreview}
                  disabled={isEmptying || !hasReviewToday}
                >
                  {isEmptying ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : <PackageX className="w-3.5 h-3.5 me-1" />}
                  {t('stock.empty_truck')}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl text-[11px] px-2 border-orange-400 text-orange-700 bg-orange-50/50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                  onClick={() => setShowExchangeDialog(true)}
                  disabled={!selectedWorker}
                >
                  <RefreshCw className="w-3.5 h-3.5 me-1" />
                  تغيير
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl text-[11px] px-2 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setShowLoadSheetPrint(true)}
                  disabled={!selectedWorker}
                >
                  <Printer className="w-3.5 h-3.5 me-1" />
                  ورقة الشحن
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button onClick={handleOpenAddProduct} className="flex-1 h-10 rounded-xl text-[13px] shadow-sm">
                  <Plus className="w-4 h-4 me-1" />
                  إضافة منتج
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-10 rounded-xl text-[13px] border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setShowPartialLoadDialog(true)}
                  disabled={isSaving}
                >
                  <ShoppingCart className="w-4 h-4 me-1" />
                  شحن من الطلبيات
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  className="flex-1 h-10 rounded-xl text-[13px] shadow-sm bg-primary hover:bg-primary/90"
                  onClick={handleCompleteSession}
                  disabled={sessionItems.length === 0 || completeSession.isPending}
                >
                  {completeSession.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  <Save className="w-4 h-4 me-1" />
                  تأكيد الشحن
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-10 rounded-xl text-[13px] text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => handleDeleteSession(activeSessionId!)}
                  disabled={deleteSession.isPending}
                >
                  {deleteSession.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  <X className="w-4 h-4 me-1" />
                  إلغاء الجلسة
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Add Product Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              إضافة منتج للشاحنة
            </DialogTitle>
          </DialogHeader>
          {addProductId && (() => {
            const product = allProductOptions.find(p => p.id === addProductId);
            const available = getAvailableQuantity(addProductId);
            const suggestion = suggestions.find(s => s.product_id === addProductId);
            const offer = productOffers[addProductId];
            // Calculate loaded this session for this product
            const loadedThisSession = sessionItems
              .filter((si: any) => si.product_id === addProductId)
              .reduce((sum: number, si: any) => sum + (si.quantity || 0), 0);
            const previousStock = (suggestion?.current_stock || 0) - loadedThisSession;
            return (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="font-semibold text-sm text-center">{product?.name}</div>
                  <div className="flex items-center justify-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>المتاح: <strong>{fmtQty(available)}</strong></span>
                    <span>|</span>
                    <span>في الشاحنة: <strong>{fmtQty(suggestion?.current_stock || previousStock)}</strong></span>
                    {suggestion && suggestion.suggested_load > 0 && (
                      <>
                        <span>|</span>
                        <span>يحتاج: <strong className="text-destructive">{fmtQty(suggestion.suggested_load)}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>الكمية (صندوق)</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="any"
                    max={available}
                    value={addProductQty}
                    onFocus={e => e.target.select()}
                    onChange={e => setAddProductQty(parseFloat(e.target.value) || 0)}
                    className="text-center text-lg h-12"
                  />
                </div>

                {offer && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-md p-2">
                      <Gift className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span>عرض: <strong>{offer.giftQty} {offer.giftUnit === 'piece' ? 'قطعة' : 'صندوق'}</strong> لكل <strong>{offer.minQty}</strong></span>
                    </div>
                    {suggestedGiftQty > 0 && (
                      <div className="flex items-center justify-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md p-2">
                        <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>الشحن المقترح: <strong className="text-blue-700 dark:text-blue-300">
                          {(() => {
                            const product = products.find(p => p.id === addProductId);
                            const piecesPerBox = product?.pieces_per_box || 20;
                            const giftInCustom = suggestedGiftUnit === 'piece'
                              ? totalPiecesToCustom(suggestedGiftQty, piecesPerBox)
                              : suggestedGiftQty;
                            return fmtQty(addCustomQty(addProductQty, giftInCustom, piecesPerBox));
                          })()}
                        </strong> ({addProductQty} + {suggestedGiftQty} {suggestedGiftUnit === 'piece' ? 'قطعة' : 'صندوق'} هدية)</span>
                      </div>
                    )}
                    {suggestedGiftQty > 0 && addProductGiftQty === 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                        onClick={() => {
                          setAddProductGiftQty(suggestedGiftQty);
                          setAddProductGiftUnit(suggestedGiftUnit);
                        }}
                      >
                        <Gift className="w-4 h-4 me-2 text-green-600" />
                        إضافة الهدايا المقترحة ({suggestedGiftQty} {suggestedGiftUnit === 'piece' ? 'قطعة' : 'صندوق'})
                      </Button>
                    )}
                    {addProductGiftQty > 0 && (
                      <div className="flex items-center justify-between gap-2 text-sm bg-primary/10 border border-primary/20 rounded-md p-2.5">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-primary shrink-0" />
                          <span>هدايا: <strong className="text-primary text-base">{addProductGiftQty}</strong> {addProductGiftUnit === 'piece' ? 'قطعة' : 'صندوق'}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => { setAddProductGiftQty(0); setAddProductGiftUnit('piece'); }}
                        >
                          إزالة
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Custom Load Toggle */}
                <div className="space-y-2 border-t pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">شحن مخصص (لعميل محدد)</Label>
                    <Switch checked={addProductIsCustomLoad} onCheckedChange={(checked) => {
                      setAddProductIsCustomLoad(checked);
                      if (!checked) {
                        setAddProductCustomerId(null);
                        setAddProductCustomerName('');
                      }
                    }} />
                  </div>
                  {addProductIsCustomLoad && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full h-10 justify-between text-sm"
                        onClick={() => setShowCustomerPicker(true)}
                      >
                        {addProductCustomerName ? (
                          <span className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-primary" />
                            {addProductCustomerName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">اختر العميل</span>
                        )}
                      </Button>
                      {productSurplus > 0 && (
                        <div className="flex items-center justify-center gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>فائض المنتج: <strong className="text-amber-700 dark:text-amber-400">{fmtQty(productSurplus)}</strong></span>
                        </div>
                      )}
                      <Input
                        placeholder="ملاحظة إضافية (اختياري)"
                        value={addProductCustomLoadNote}
                        onChange={e => setAddProductCustomLoadNote(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={handleAddProductToSession} disabled={isSaving || addProductQty <= 0} className="w-full">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Plus className="w-4 h-4 me-1" />
              إضافة للشاحنة
            </Button>
            <Button variant="outline" onClick={() => setShowAddProductDialog(false)} className="w-full">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Picker for Custom Load */}
      <CustomerPickerDialog
        open={showCustomerPicker}
        onOpenChange={setShowCustomerPicker}
        customers={customersData}
        sectors={sectorsData}
        selectedCustomerId={addProductCustomerId || undefined}
        onSelect={(customer) => {
          setAddProductCustomerId(customer.id);
          setAddProductCustomerName(customer.store_name || customer.name);
          setShowCustomerPicker(false);
        }}
      />

      {/* Session History Dialog */}
      <Dialog open={showSessionHistory} onOpenChange={setShowSessionHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              سجل جلسات الشحن والتفريغ
            </DialogTitle>
          </DialogHeader>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", historyDateFilter && "border-primary text-primary")}>
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {historyDateFilter ? format(historyDateFilter, 'yyyy-MM-dd') : 'تاريخ'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={historyDateFilter}
                  onSelect={setHistoryDateFilter}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Select value={historyProductFilter || 'all'} onValueChange={(v) => setHistoryProductFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue placeholder="منتج" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {sessionProductOptions.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(historyDateFilter || historyProductFilter) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setHistoryDateFilter(undefined); setHistoryProductFilter(''); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[55dvh]">
            <div className="space-y-2">
              {filteredSessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">لا توجد جلسات سابقة</p>
              ) : filteredSessions.map((session, idx) => {
                const reviewCounts = sessionDiscrepancyMap[session.id] || { deficit: 0, surplus: 0 };
                
                // Check if there's an accounting session between this session and the previous one
                const prevSession = filteredSessions[idx - 1];
                let hasAccountingBetween = false;
                const thisDate = new Date(session.created_at).getTime();
                
                if (prevSession) {
                  const prevDate = new Date(prevSession.created_at).getTime();
                  hasAccountingBetween = accountingSessions.some(a => {
                    const aDate = new Date(a.completed_at).getTime();
                    return aDate > thisDate && aDate <= prevDate;
                  });
                } else {
                  // First item (most recent) - check if any accounting session completed after it
                  hasAccountingBetween = accountingSessions.some(a => {
                    const aDate = new Date(a.completed_at).getTime();
                    return aDate > thisDate;
                  });
                }

                return (
                  <React.Fragment key={session.id}>
                  {hasAccountingBetween && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="flex-1 h-px bg-destructive/50" />
                      <Badge variant="destructive" className="text-[10px] px-2 py-0.5">جلسة محاسبة</Badge>
                      <div className="flex-1 h-px bg-destructive/50" />
                    </div>
                  )}
                  <Card
                    key={session.id}
                    className={`border cursor-pointer hover:bg-accent/50 transition-colors ${session.status === 'open' ? 'border-primary/30' : ''}`}
                    onClick={() => handleViewSession(session.id)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Badge variant={session.status === 'unloaded' ? 'destructive' : 'secondary'} className={`text-xs ${session.status === 'review' ? 'bg-blue-600 text-white hover:bg-blue-700' : session.status === 'exchange' ? 'bg-orange-500 text-black hover:bg-orange-600' : session.status === 'open' || session.status === 'completed' ? 'bg-green-600 text-white hover:bg-green-700' : ''}`}>
                            {session.status === 'open' ? 'شحن' : session.status === 'unloaded' ? 'تفريغ' : session.status === 'review' ? 'مراجعة' : session.status === 'exchange' ? 'تغيير' : 'شحن'}
                          </Badge>
                          {session.status === 'review' && reviewCounts.deficit > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ms-1">عجز ({reviewCounts.deficit})</Badge>
                          )}
                          {session.status === 'review' && reviewCounts.surplus > 0 && (
                            <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 ms-1">فائض ({reviewCounts.surplus})</Badge>
                          )}
                          <span className="text-xs text-muted-foreground ms-2">
                            {new Date(session.created_at).toLocaleDateString('ar-DZ')} {new Date(session.created_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {session.status === 'open' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSessionId(session.id);
                                setShowSessionHistory(false);
                              }}
                            >
                              استئناف
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-primary hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrintSessionId(session.id);
                            }}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.id);
                            }}
                            disabled={deleteSession.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        المدير: {(session.manager as any)?.full_name || '—'}
                      </div>
                    </CardContent>
                  </Card>
                  </React.Fragment>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Session Details View Dialog */}
      <Dialog open={!!viewSessionId} onOpenChange={(open) => { if (!open) setViewSessionId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {(() => {
                const s = sessions.find(s => s.id === viewSessionId);
                return s?.status === 'unloaded' ? 'تفاصيل جلسة التفريغ' : s?.status === 'review' ? 'تفاصيل جلسة المراجعة' : s?.status === 'exchange' ? 'تفاصيل جلسة الاستبدال' : 'تفاصيل جلسة الشحن';
              })()}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const session = sessions.find(s => s.id === viewSessionId);
            const isUnload = session?.status === 'unloaded';
            return session ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">الحالة:</div>
                  <div>
                    <Badge variant={session.status === 'unloaded' ? 'destructive' : 'secondary'} className={`text-xs ${session.status === 'review' ? 'bg-blue-600 text-white hover:bg-blue-700' : session.status === 'exchange' ? 'bg-orange-500 text-black hover:bg-orange-600' : session.status !== 'unloaded' ? 'bg-green-600 text-white hover:bg-green-700' : ''}`}>
                      {isUnload ? 'تفريغ' : session.status === 'review' ? 'مراجعة' : session.status === 'exchange' ? 'تغيير' : 'شحن'}
                    </Badge>
                    {session.notes?.includes('فائض') && (
                      <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 ms-1">فائض</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground">التاريخ:</div>
                  <div className="text-sm">{new Date(session.created_at).toLocaleString('ar-DZ')}</div>
                  <div className="text-muted-foreground">المدير:</div>
                  <div className="text-sm">{(session.manager as any)?.full_name || '—'}</div>
                  {session.completed_at && (
                    <>
                      <div className="text-muted-foreground">تم الإكمال:</div>
                      <div className="text-sm">{new Date(session.completed_at).toLocaleString('ar-DZ')}</div>
                    </>
                  )}
                  {session.notes && (
                    <>
                      <div className="text-muted-foreground">ملاحظات:</div>
                      <div className="text-sm">{session.notes}</div>
                    </>
                  )}
                </div>
                <div className="border-t pt-3">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Truck className="w-4 h-4" />
                    {session.status === 'review' 
                      ? `المنتجات المراجعة (${viewSessionItems.length})`
                      : isUnload 
                        ? `المنتجات المفرّغة (${viewSessionItems.length})` 
                        : `المنتجات المشحونة (${viewSessionItems.length})`}
                  </h4>
                  {isLoadingViewItems ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : session.status === 'review' ? (
                    viewSessionItems.length === 0 && viewReviewDiscrepancies.length === 0 ? (
                      <div className="text-center py-4">
                        <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
                        <p className="text-sm text-green-600 font-medium">جميع المنتجات مطابقة</p>
                        <p className="text-xs text-muted-foreground">لا توجد فوارق في هذه الجلسة</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[40dvh]">
                        <div className="space-y-2">
                          {/* Show discrepancies first */}
                          {viewReviewDiscrepancies.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                الفوارق ({viewReviewDiscrepancies.length})
                              </p>
                              {viewReviewDiscrepancies.map((disc: any) => (
                                <div key={disc.id} className={`rounded-lg px-3 py-2.5 ${
                                  disc.discrepancy_type === 'deficit' 
                                    ? 'bg-destructive/10 border border-destructive/30' 
                                    : 'bg-orange-50 dark:bg-orange-900/10 border border-orange-300'
                                }`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold">{disc.product?.name || '—'}</span>
                                    <Badge className={`text-[10px] ${
                                      disc.discrepancy_type === 'deficit' 
                                        ? 'bg-destructive text-white' 
                                        : 'bg-orange-500 text-white'
                                    }`}>
                                      {disc.discrepancy_type === 'deficit' ? 'عجز' : 'فائض'}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    الفارق: <span className="font-bold">{Number(disc.quantity).toFixed(2)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Show matched items */}
                          {(() => {
                            const discrepancyProductIds = new Set(viewReviewDiscrepancies.map((d: any) => d.product_id));
                            const matchedItems = viewSessionItems.filter((item: any) => !discrepancyProductIds.has(item.product_id));
                            if (matchedItems.length === 0) return null;
                            return (
                              <div className="space-y-1.5 mt-2">
                                <p className="text-xs font-semibold text-green-600 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  مطابق ({matchedItems.length})
                                </p>
                                {matchedItems.map((item: any) => (
                                  <div key={item.id} className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">{(item.product as any)?.name || '—'}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{fmtQty(item.previous_quantity || 0)}</span>
                                        <Badge className="bg-green-600 text-white text-[10px]">مطابق</Badge>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </ScrollArea>
                    )
                  ) : viewSessionItems.length === 0 ? (
                    <p className="text-center text-muted-foreground text-xs py-4">لا توجد منتجات في هذه الجلسة</p>
                  ) : (
                    <ScrollArea className="max-h-[40dvh]">
                      <div className="space-y-2">
                        {viewSessionItems.map(item => {
                          const ppb = (item.product as any)?.pieces_per_box || 20;
                          const giftInCustom = item.gift_unit === 'box' 
                            ? item.gift_quantity 
                            : totalPiecesToCustom(item.gift_quantity || 0, ppb);
                          const totalLoaded = item.gift_quantity > 0 
                            ? addCustomQty(item.quantity, giftInCustom, ppb)
                            : item.quantity;
                          
                          const prevQty = item.previous_quantity || 0;
                          
                          if (isUnload) {
                            // Unloading: show previous balance, returned, surplus, remaining
                            const totalReturned = item.surplus_quantity > 0 
                              ? addCustomQty(item.quantity, item.surplus_quantity, ppb) 
                              : item.quantity;
                            const remaining = prevQty > 0 ? subtractCustomQty(prevQty, item.quantity, ppb) : 0;
                            return (
                              <div key={item.id} className="bg-muted/50 rounded-lg px-3 py-2.5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-semibold">{(item.product as any)?.name || '—'}</span>
                                </div>
                                <div className="grid grid-cols-4 gap-1 text-center">
                                  <div className="bg-muted rounded p-1.5">
                                    <p className="text-[10px] text-muted-foreground">سابق</p>
                                    <p className="text-xs font-bold">{fmtQty(prevQty)}</p>
                                  </div>
                                  <div className="bg-background rounded p-1.5">
                                    <p className="text-[10px] text-muted-foreground">مُرجع</p>
                                    <p className="text-xs font-bold">{fmtQty(item.quantity)}</p>
                                  </div>
                                  <div className={`rounded p-1.5 ${item.surplus_quantity > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-background'}`}>
                                    <p className="text-[10px] text-muted-foreground">فائض</p>
                                    <p className={`text-xs font-bold ${item.surplus_quantity > 0 ? 'text-amber-600' : ''}`}>{fmtQty(item.surplus_quantity || 0)}</p>
                                  </div>
                                  <div className="bg-destructive/10 rounded p-1.5">
                                    <p className="text-[10px] text-muted-foreground">متبقي</p>
                                    <p className="text-xs font-bold text-destructive">{fmtQty(Math.max(0, remaining))}</p>
                                  </div>
                                </div>
                                {item.is_custom_load && (
                                  <div className="text-xs text-blue-600 mt-1">شحن مخصص{item.custom_load_note ? `: ${item.custom_load_note}` : ''}</div>
                                )}
                              </div>
                            );
                          }
                          
                          // Loading session: show previous, new load, total
                          const totalAfterLoad = prevQty > 0 
                            ? addCustomQty(prevQty, totalLoaded, ppb) 
                            : totalLoaded;
                          return (
                            <div key={item.id} className="bg-muted/50 rounded-lg px-3 py-2.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-semibold">{(item.product as any)?.name || '—'}</span>
                              </div>
                              <div className={`grid grid-cols-3 gap-1 text-center`}>
                                <div className="bg-muted rounded p-1.5">
                                  <p className="text-[10px] text-muted-foreground">سابق</p>
                                  <p className="text-xs font-bold">{fmtQty(prevQty)}</p>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/20 rounded p-1.5">
                                  <p className="text-[10px] text-muted-foreground">جديد</p>
                                  <p className="text-xs font-bold text-green-600">{fmtQty(totalLoaded)}</p>
                                </div>
                                <div className="bg-primary/10 rounded p-1.5">
                                  <p className="text-[10px] text-muted-foreground">الكلي</p>
                                  <p className="text-xs font-bold text-primary">{fmtQty(totalAfterLoad)}</p>
                                </div>
                              </div>
                              {item.gift_quantity > 0 && (
                                <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                                  <Gift className="w-3 h-3" />
                                  هدية: {item.gift_quantity} {item.gift_unit === 'box' ? 'صندوق' : 'قطعة'}
                                </div>
                              )}
                              {item.surplus_quantity > 0 && (
                                <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  فائض: {fmtQty(item.surplus_quantity)}
                                </div>
                              )}
                              {item.is_custom_load && (
                                <div className="text-xs text-blue-600 mt-1">شحن مخصص{item.custom_load_note ? `: ${item.custom_load_note}` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            ) : null;
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showEmptyDialog} onOpenChange={setShowEmptyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageX className="w-5 h-5 text-destructive" />
              {t('stock.empty_truck')}
            </DialogTitle>
            <DialogDescription>{t('stock.empty_truck_confirm')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50dvh] overflow-y-auto space-y-3">
            {emptyTruckItems.map((item, idx) => {
              const ppb = item.piecesPerBox;
              return (
                <Card key={item.product_id} className="border">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{item.product_name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>رصيد النظام: <strong>{fmtQty(item.quantity)}</strong></span>
                      </div>
                    </div>
                    
                    {/* Stock Verification */}
                    <div className="space-y-2 bg-muted/30 rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-semibold">الرصيد الفعلي:</Label>
                        <Input
                          type="number" min={0} step="any"
                          value={item.actualQty}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            const systemQty = item.quantity;
                            const ppb = item.piecesPerBox;
                            const actualPieces = customToTotalPieces(val, ppb);
                            const systemPieces = customToTotalPieces(systemQty, ppb);
                            let status: EmptyTruckItem['verificationStatus'] = 'equivalent';
                            let surplusVal = 0;
                            if (actualPieces > systemPieces) {
                              status = 'surplus';
                              surplusVal = totalPiecesToCustom(actualPieces - systemPieces, ppb);
                            } else if (actualPieces < systemPieces) {
                              status = 'deficit';
                            }
                            setEmptyTruckItems(prev => prev.map((it, i2) => 
                              it.product_id === item.product_id 
                                ? { ...it, actualQty: val, verificationStatus: status, surplusQty: surplusVal, returnQty: val }
                                : it
                            ));
                          }}
                          className="text-center h-8 flex-1"
                        />
                      </div>
                      
                      {/* Verification status badge */}
                      {item.verificationStatus === 'equivalent' && item.actualQty === item.quantity && (
                        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>مطابق ✓</span>
                        </div>
                      )}
                      {item.verificationStatus === 'surplus' && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>فائض: {fmtQty(item.surplusQty)} — سيتم تسجيله كفائض</span>
                        </div>
                      )}
                      {item.verificationStatus === 'deficit' && (
                        <div className="flex items-center gap-1 text-xs text-destructive bg-destructive/5 rounded px-2 py-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>عجز: {fmtQty(subtractCustomQty(item.quantity, item.actualQty, item.piecesPerBox))} — سيتم تسجيله كعجز</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5 text-sm bg-muted/50 rounded-md p-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">إجمالي الإرجاع</span>
              <Badge variant="secondary">{fmtQty(emptyTruckItems.reduce((s, it) => s + it.actualQty, 0))} صندوق</Badge>
            </div>
            {emptyTruckItems.some(it => it.verificationStatus === 'surplus') && (
              <div className="flex items-center justify-between text-xs text-amber-600">
                <span>فائض</span>
                <span className="font-bold">{fmtQty(emptyTruckItems.filter(it => it.verificationStatus === 'surplus').reduce((s, it) => s + it.surplusQty, 0))}</span>
              </div>
            )}
            {emptyTruckItems.some(it => it.verificationStatus === 'deficit') && (
              <div className="flex items-center justify-between text-xs text-destructive">
                <span>عجز</span>
                <span className="font-bold">{fmtQty(emptyTruckItems.filter(it => it.verificationStatus === 'deficit').reduce((s, it) => subtractCustomQty(it.quantity, it.actualQty, it.piecesPerBox) + s, 0))}</span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEmptyDialog(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleEmptyTruckConfirm} disabled={isEmptying || emptyTruckItems.every(it => it.actualQty === 0)}>
              {isEmptying && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('stock.confirm_return')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worker Picker */}
      <WorkerPickerDialog
        open={showWorkerPicker} onOpenChange={setShowWorkerPicker}
        workers={workers} selectedWorkerId={selectedWorker}
        onSelect={setSelectedWorker} stockAlerts={stockAlerts}
      />

      {/* Product Picker */}
      <ProductPickerDialog
        open={showProductPicker} onOpenChange={setShowProductPicker}
        products={allProductOptions}
        selectedProductIds={sessionItems.map((i: any) => i.product_id)}
        onSelect={handleProductSelected}
      />

      {/* Edit Session Item Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              تعديل الكمية
            </DialogTitle>
            <DialogDescription>{editingItem?.product?.name || editingItem?.notes || ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الكمية (صناديق)</Label>
              <Input
                type="number" min={1} value={editQty}
                onFocus={e => e.target.select()}
                onChange={e => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div>
              <Label>كمية الهدايا</Label>
              <div className="flex gap-2">
                <Input
                  type="number" min={0} value={editGiftQty} className="flex-1"
                  onFocus={e => e.target.select()}
                  onChange={e => setEditGiftQty(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <select
                  className="border rounded px-2 text-sm bg-background"
                  value={editGiftUnit}
                  onChange={e => setEditGiftUnit(e.target.value)}
                >
                  <option value="piece">قطعة</option>
                  <option value="box">صندوق</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)}>إلغاء</Button>
            <Button onClick={handleSaveEditItem} disabled={isEditSaving}>
              {isEditSaving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StockVerificationDialog
        open={showVerificationDialog}
        onOpenChange={setShowVerificationDialog}
        workerId={selectedWorker}
        onComplete={async () => {
          await Promise.all([
            refresh(),
            refetchSessions(),
            queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] }),
            queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] }),
            queryClient.invalidateQueries({ queryKey: ['worker-load-suggestions'] }),
          ]);
        }}
      />
      {selectedWorker && branchId && (
        <ExchangeSessionDialog
          open={showExchangeDialog}
          onOpenChange={setShowExchangeDialog}
          workerId={selectedWorker}
          workerName={workers.find(w => w.id === selectedWorker)?.full_name || ''}
          branchId={branchId}
          onComplete={async () => {
            await Promise.all([
              refresh(),
              refetchSessions(),
            ]);
          }}
        />
      )}
      {selectedWorker && activeSessionId && (
        <PartialLoadFromOrdersDialog
          open={showPartialLoadDialog}
          onOpenChange={setShowPartialLoadDialog}
          workerId={selectedWorker}
          workerName={workers.find(w => w.id === selectedWorker)?.full_name || ''}
          branchId={branchId}
          onConfirm={handlePartialLoadConfirm}
        />
      )}
      {selectedWorker && (
        <LoadSheetPrintView
          open={showLoadSheetPrint}
          onOpenChange={setShowLoadSheetPrint}
          workerId={selectedWorker}
          workerName={workers.find(w => w.id === selectedWorker)?.full_name || ''}
          branchId={branchId}
        />
      )}
      {printSessionId && (
        <SessionPrintView
          open={!!printSessionId}
          onOpenChange={(open) => { if (!open) setPrintSessionId(null); }}
          sessionId={printSessionId}
          workerName={workers.find(w => w.id === selectedWorker)?.full_name || ''}
        />
      )}
    </div>
  );
};

export default LoadStock;
