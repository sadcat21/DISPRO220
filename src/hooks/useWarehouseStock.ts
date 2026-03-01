import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/types/database';

export interface WarehouseStockItem {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  updated_at: string;
  product?: Product;
}

export interface WorkerStockItem {
  id: string;
  worker_id: string;
  product_id: string;
  branch_id: string | null;
  quantity: number;
  updated_at: string;
  product?: Product;
  worker?: { id: string; full_name: string; username: string };
}

export interface StockReceipt {
  id: string;
  branch_id: string | null;
  created_by: string;
  receipt_date: string;
  invoice_number: string | null;
  invoice_photo_url: string | null;
  notes: string | null;
  total_items: number | null;
  created_at: string;
  items?: StockReceiptItem[];
  creator?: { full_name: string };
}

export interface StockReceiptItem {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  product?: Product;
}

export const useWarehouseStock = () => {
  const { workerId, activeBranch } = useAuth();
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockItem[]>([]);
  const [workerStocks, setWorkerStocks] = useState<WorkerStockItem[]>([]);
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [workers, setWorkers] = useState<{ id: string; full_name: string; username: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const branchId = activeBranch?.id;

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setProducts(data || []);
  }, []);

  const fetchWarehouseStock = useCallback(async () => {
    if (!branchId) { setWarehouseStock([]); return; }
    const { data } = await supabase
      .from('warehouse_stock')
      .select('*')
      .eq('branch_id', branchId);
    
    setWarehouseStock(data || []);
  }, [branchId]);

  const fetchWorkerStocks = useCallback(async () => {
    let query = supabase.from('worker_stock').select('*');
    if (branchId) query = query.eq('branch_id', branchId);
    const { data } = await query;
    setWorkerStocks(data || []);
  }, [branchId]);

  const fetchWorkers = useCallback(async () => {
    let query = supabase.from('workers_safe').select('id, full_name, username').eq('is_active', true);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data } = await query;
    setWorkers((data || []).map(w => ({ id: w.id!, full_name: w.full_name!, username: w.username! })));
  }, [branchId]);

  const fetchReceipts = useCallback(async () => {
    let query = supabase
      .from('stock_receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data } = await query;
    setReceipts(data || []);
  }, [branchId]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchProducts(), fetchWarehouseStock(), fetchWorkerStocks(), fetchWorkers(), fetchReceipts()]);
    setIsLoading(false);
  }, [fetchProducts, fetchWarehouseStock, fetchWorkerStocks, fetchWorkers, fetchReceipts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime subscriptions for warehouse and worker stock
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel('warehouse-stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock', filter: `branch_id=eq.${branchId}` }, () => {
        fetchWarehouseStock();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_stock', filter: `branch_id=eq.${branchId}` }, () => {
        fetchWorkerStocks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [branchId, fetchWarehouseStock, fetchWorkerStocks]);

  // Enrich stock with product data
  const enrichedWarehouseStock = warehouseStock
    .map(s => ({ ...s, product: products.find(p => p.id === s.product_id) }))
    .filter(s => s.product && s.quantity > 0);

  const enrichedWorkerStocks = workerStocks
    .map(s => ({
      ...s,
      product: products.find(p => p.id === s.product_id),
      worker: workers.find(w => w.id === s.worker_id),
    }))
    .filter(s => s.product && s.quantity > 0);

  // Group worker stocks by worker
  const workerStocksByWorker = enrichedWorkerStocks.reduce((acc, item) => {
    const wId = item.worker_id;
    if (!acc[wId]) acc[wId] = { worker: item.worker, items: [] };
    acc[wId].items.push(item);
    return acc;
  }, {} as Record<string, { worker: WorkerStockItem['worker']; items: WorkerStockItem[] }>);

  // Create receipt
  const createReceipt = async (
    receiptData: { invoice_number?: string; notes?: string; invoice_photo_url?: string },
    items: { product_id: string; quantity: number }[]
  ) => {
    if (!workerId || !branchId) throw new Error('Missing worker or branch');

    const { data: receipt, error: receiptError } = await supabase
      .from('stock_receipts')
      .insert({
        branch_id: branchId,
        created_by: workerId,
        invoice_number: receiptData.invoice_number || null,
        invoice_photo_url: receiptData.invoice_photo_url || null,
        notes: receiptData.notes || null,
        total_items: items.reduce((sum, i) => sum + i.quantity, 0),
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    // Fetch pallet settings to auto-calculate pallet quantities
    const { data: palletSettings } = await supabase
      .from('pallet_settings')
      .select('product_id, boxes_per_pallet')
      .eq('branch_id', branchId);

    // Insert items with pallet quantities
    const receiptItems = items.map(i => {
      const setting = (palletSettings || []).find(s => s.product_id === i.product_id);
      const palletQty = setting && setting.boxes_per_pallet > 0
        ? Math.ceil(i.quantity / setting.boxes_per_pallet)
        : 0;
      return {
        receipt_id: receipt.id,
        product_id: i.product_id,
        quantity: i.quantity,
        pallet_quantity: palletQty,
      };
    });
    const { error: itemsError } = await supabase.from('stock_receipt_items').insert(receiptItems);
    if (itemsError) throw itemsError;

    // Create stock movements and update warehouse stock
    for (const item of items) {
      // Movement
      await supabase.from('stock_movements').insert({
        product_id: item.product_id,
        branch_id: branchId,
        quantity: item.quantity,
        movement_type: 'receipt',
        status: 'approved',
        created_by: workerId,
        receipt_id: receipt.id,
        notes: `استلام من المصنع - فاتورة: ${receiptData.invoice_number || 'بدون'}`,
      });

      // Upsert warehouse stock
      const existing = warehouseStock.find(s => s.product_id === item.product_id);
      if (existing) {
        await supabase
          .from('warehouse_stock')
          .update({ quantity: existing.quantity + item.quantity })
          .eq('id', existing.id);
      } else {
        await supabase.from('warehouse_stock').insert({
          branch_id: branchId,
          product_id: item.product_id,
          quantity: item.quantity,
        });
      }
    }

    await loadAll();
    return receipt;
  };

  // Load products to worker
  const loadToWorker = async (
    targetWorkerId: string,
    items: { product_id: string; quantity: number; notes?: string }[]
  ) => {
    if (!workerId || !branchId) throw new Error('Missing worker or branch');

    for (const item of items) {
      const warehouseItem = warehouseStock.find(s => s.product_id === item.product_id);
      if (!warehouseItem || warehouseItem.quantity < item.quantity) {
        const productName = products.find(p => p.id === item.product_id)?.name || '';
        throw new Error(`الكمية المتاحة من ${productName} غير كافية`);
      }
    }

    for (const item of items) {
      // Deduct from warehouse
      const warehouseItem = warehouseStock.find(s => s.product_id === item.product_id)!;
      await supabase
        .from('warehouse_stock')
        .update({ quantity: warehouseItem.quantity - item.quantity })
        .eq('id', warehouseItem.id);

      // Add to worker stock
      const existingWorkerStock = workerStocks.find(
        s => s.worker_id === targetWorkerId && s.product_id === item.product_id
      );
      if (existingWorkerStock) {
        await supabase
          .from('worker_stock')
          .update({ quantity: existingWorkerStock.quantity + item.quantity })
          .eq('id', existingWorkerStock.id);
      } else {
        await supabase.from('worker_stock').insert({
          worker_id: targetWorkerId,
          product_id: item.product_id,
          branch_id: branchId,
          quantity: item.quantity,
        });
      }

      // Movement record
      await supabase.from('stock_movements').insert({
        product_id: item.product_id,
        branch_id: branchId,
        quantity: item.quantity,
        movement_type: 'load',
        status: 'approved',
        created_by: workerId,
        worker_id: targetWorkerId,
        notes: item.notes || 'شحن من المخزن إلى عامل التوصيل',
      });
    }

    await loadAll();
  };

  return {
    warehouseStock: enrichedWarehouseStock,
    workerStocksByWorker,
    receipts,
    products,
    workers,
    isLoading,
    createReceipt,
    loadToWorker,
    refresh: loadAll,
    branchId,
  };
};
