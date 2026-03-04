import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Truck, Package, CheckCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface WorkerLoadRequestBannerProps {
  workerId: string;
  onLoadProducts: (products: { productId: string; productName: string; quantity: number; piecesPerBox: number }[]) => void;
  activeSessionId: string | null;
}

interface LoadRequestWithItems {
  id: string;
  status: string;
  notes: string | null;
  created_at: string;
  products: { productId: string; productName: string; quantity: number; piecesPerBox: number }[];
}

const WorkerLoadRequestBanner: React.FC<WorkerLoadRequestBannerProps> = ({ workerId, onLoadProducts, activeSessionId }) => {
  const [request, setRequest] = useState<LoadRequestWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!workerId) return;
    fetchPendingRequest();
  }, [workerId]);

  const fetchPendingRequest = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('worker_load_requests')
        .select('id, status, notes, created_at')
        .eq('worker_id', workerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) { setRequest(null); return; }

      const req = data[0];
      // Fetch items
      const { data: items } = await supabase
        .from('worker_load_request_items')
        .select('product_id, quantity, product:products(name, pieces_per_box)')
        .eq('request_id', req.id);

      // Aggregate by product
      const map = new Map<string, { productId: string; productName: string; quantity: number; piecesPerBox: number }>();
      for (const item of (items || [])) {
        const pid = item.product_id;
        const existing = map.get(pid);
        if (existing) {
          existing.quantity += Number(item.quantity);
        } else {
          map.set(pid, {
            productId: pid,
            productName: (item.product as any)?.name || '—',
            quantity: Number(item.quantity),
            piecesPerBox: (item.product as any)?.pieces_per_box || 20,
          });
        }
      }

      setRequest({
        ...req,
        products: Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
      });
    } catch {
      console.error('Error fetching load request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = () => {
    if (!request) return;
    onLoadProducts(request.products);
    // Mark as loaded
    supabase
      .from('worker_load_requests')
      .update({ status: 'loaded' })
      .eq('id', request.id)
      .then(() => {
        setRequest(null);
        toast.success('تم قبول طلب الشحن');
      });
  };

  const handleReject = async () => {
    if (!request) return;
    await supabase
      .from('worker_load_requests')
      .update({ status: 'rejected' })
      .eq('id', request.id);
    setRequest(null);
    toast.info('تم رفض طلب الشحن');
  };

  if (isLoading) return null;
  if (!request) return null;

  const totalBoxes = request.products.reduce((s, p) => s + p.quantity, 0);

  return (
    <Card className="border-2 border-primary/40 bg-primary/5">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">طلب شحن من العامل</span>
            <Badge variant="secondary" className="text-xs">{request.notes}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{format(new Date(request.created_at), 'HH:mm')}</span>
        </div>

        <Button variant="ghost" size="sm" className="w-full justify-between text-xs" onClick={() => setExpanded(!expanded)}>
          <span className="flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            {request.products.length} منتج — {totalBoxes} صندوق
          </span>
          <span>{expanded ? '▲' : '▼'}</span>
        </Button>

        {expanded && (
          <ScrollArea className="max-h-[20vh]">
            <div className="space-y-1">
              {request.products.map(p => (
                <div key={p.productId} className="flex items-center justify-between bg-background rounded-lg px-3 py-1.5 text-sm">
                  <span>{p.productName}</span>
                  <Badge variant="outline">{p.quantity}</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleApprove} disabled={!activeSessionId}>
            <CheckCircle className="w-4 h-4 me-1" />
            شحن الطلب
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={handleReject}>
            <X className="w-4 h-4 me-1" />
            رفض
          </Button>
        </div>
        {!activeSessionId && (
          <p className="text-[10px] text-muted-foreground text-center">يجب بدء جلسة شحن أولاً لقبول الطلب</p>
        )}
      </CardContent>
    </Card>
  );
};

export default WorkerLoadRequestBanner;
