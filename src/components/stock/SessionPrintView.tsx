import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Printer, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';

interface SessionPrintViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  workerName: string;
}

interface SessionData {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  manager: { full_name: string } | null;
  worker: { full_name: string } | null;
}

interface SessionItem {
  id: string;
  product_id: string;
  quantity: number;
  gift_quantity: number;
  gift_unit: string | null;
  previous_quantity: number;
  surplus_quantity: number;
  notes: string | null;
  product: { name: string; pieces_per_box: number } | null;
}

const SessionPrintView: React.FC<SessionPrintViewProps> = ({
  open, onOpenChange, sessionId, workerName,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = document.createElement('div');
    div.id = 'session-print-portal';
    document.body.appendChild(div);
    setContainer(div);
    return () => { document.body.removeChild(div); };
  }, []);

  useEffect(() => {
    if (!open || !sessionId) return;
    fetchData();
  }, [open, sessionId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sessionRes, itemsRes] = await Promise.all([
        supabase.from('loading_sessions').select(`
          id, status, created_at, completed_at, notes,
          manager:workers!loading_sessions_manager_id_fkey(full_name),
          worker:workers!loading_sessions_worker_id_fkey(full_name)
        `).eq('id', sessionId).single(),
        supabase.from('loading_session_items').select(`
          id, product_id, quantity, gift_quantity, gift_unit, previous_quantity, surplus_quantity, notes,
          product:products(name, pieces_per_box)
        `).eq('session_id', sessionId).order('created_at', { ascending: true }),
      ]);

      const s = sessionRes.data as unknown as SessionData;
      const itemsList = (itemsRes.data || []) as unknown as SessionItem[];
      setSession(s);
      setItems(itemsList);

      if (s?.status === 'review') {
        const { data: discData } = await supabase
          .from('stock_discrepancies')
          .select('id, product_id, discrepancy_type, quantity, product:products(name)')
          .eq('source_session_id', sessionId);
        setDiscrepancies(discData || []);
      } else {
        setDiscrepancies([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getSessionTitle = () => {
    if (!session) return 'جلسة';
    switch (session.status) {
      case 'open': case 'completed': return 'كشف الشحن';
      case 'unloaded': return 'كشف التفريغ';
      case 'review': return 'كشف المراجعة';
      case 'exchange': return 'كشف الاستبدال';
      default: return 'كشف الجلسة';
    }
  };

  const getSessionTitleFr = () => {
    if (!session) return '';
    switch (session.status) {
      case 'open': case 'completed': return 'Fiche de Chargement';
      case 'unloaded': return 'Fiche de Déchargement';
      case 'review': return 'Fiche de Vérification';
      case 'exchange': return 'Fiche d\'Échange';
      default: return 'Fiche de Session';
    }
  };

  const isReview = session?.status === 'review';
  const isUnload = session?.status === 'unloaded';

  const handlePrint = () => {
    window.print();
  };

  const fmtQty = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  // For review: merge discrepancies with items
  const discrepancyProductIds = new Set(discrepancies.map((d: any) => d.product_id));
  const matchedItems = items.filter(item => !discrepancyProductIds.has(item.product_id));

  const printContent = session && (
    <div ref={printRef} className="print-container" dir="rtl" style={{ display: 'none' }}>
      {/* Watermark */}
      <div style={{ position: 'fixed', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, opacity: 0.15, pointerEvents: 'none' }}>
        <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
      </div>

      {/* Header */}
      <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
        <div className="print-logo"><img src={logoImage} alt="Logo" /></div>
        <div className="print-title-section">
          <h1>{getSessionTitleFr()}</h1>
          <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '4px' }}>
            {getSessionTitle()}
          </p>
        </div>
        <div className="print-logo"><img src={logoImage} alt="Logo" /></div>
      </div>

      {/* Info */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', margin: '8px 0', fontSize: '9pt' }}>
        <div>
          <strong>العامل:</strong> {session.worker?.full_name || workerName}
          {' | '}
          <strong>المدير:</strong> {session.manager?.full_name || '—'}
        </div>
        <div>
          <strong>التاريخ:</strong> {format(new Date(session.created_at), 'dd/MM/yyyy HH:mm')}
        </div>
      </div>

      {/* Table */}
      <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
        <thead>
          <tr>
            <th style={{ width: '30px' }}>N°</th>
            <th>المنتج / Produit</th>
            {isReview ? (
              <>
                <th style={{ width: '70px' }}>رصيد النظام</th>
                <th style={{ width: '70px' }}>الكمية الفعلية</th>
                <th style={{ width: '60px' }}>الحالة</th>
                <th style={{ width: '60px' }}>الفارق</th>
              </>
            ) : isUnload ? (
              <>
                <th style={{ width: '70px' }}>الرصيد السابق</th>
                <th style={{ width: '70px' }}>المُرجع</th>
                <th style={{ width: '60px' }}>الفائض</th>
              </>
            ) : (
              <>
                <th style={{ width: '70px' }}>الرصيد السابق</th>
                <th style={{ width: '70px' }}>الكمية المشحونة</th>
                <th style={{ width: '70px' }}>الهدايا</th>
              </>
            )}
            <th style={{ width: '80px' }}>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {isReview ? (
            <>
              {/* Discrepancies */}
              {discrepancies.map((disc: any, idx: number) => {
                const item = items.find(i => i.product_id === disc.product_id);
                return (
                  <tr key={disc.id}>
                    <td className="center">{idx + 1}</td>
                    <td>{disc.product?.name || '—'}</td>
                    <td className="center">{item ? fmtQty(item.previous_quantity || 0) : '—'}</td>
                    <td className="center bold">{item ? fmtQty(item.quantity || 0) : '—'}</td>
                    <td className="center" style={{ fontWeight: 'bold', color: disc.discrepancy_type === 'deficit' ? '#c00' : '#e65100' }}>
                      {disc.discrepancy_type === 'deficit' ? 'عجز' : 'فائض'}
                    </td>
                    <td className="center bold" style={{ color: disc.discrepancy_type === 'deficit' ? '#c00' : '#e65100' }}>
                      {fmtQty(disc.quantity)}
                    </td>
                    <td className="small-text">{item?.notes || ''}</td>
                  </tr>
                );
              })}
              {/* Matched items */}
              {matchedItems.map((item, idx) => (
                <tr key={item.id}>
                  <td className="center">{discrepancies.length + idx + 1}</td>
                  <td>{item.product?.name || '—'}</td>
                  <td className="center">{fmtQty(item.previous_quantity || 0)}</td>
                  <td className="center bold">{fmtQty(item.quantity || 0)}</td>
                  <td className="center" style={{ color: '#2e7d32', fontWeight: 'bold' }}>مطابق</td>
                  <td className="center">—</td>
                  <td className="small-text">{item.notes || ''}</td>
                </tr>
              ))}
            </>
          ) : (
            items.map((item, idx) => (
              <tr key={item.id}>
                <td className="center">{idx + 1}</td>
                <td>{item.product?.name || '—'}</td>
                <td className="center">{fmtQty(item.previous_quantity || 0)}</td>
                <td className="center bold">{fmtQty(item.quantity)}</td>
                {isUnload ? (
                  <td className="center" style={{ color: item.surplus_quantity > 0 ? '#e65100' : undefined }}>
                    {fmtQty(item.surplus_quantity || 0)}
                  </td>
                ) : (
                  <td className="center">{item.gift_quantity > 0 ? `${fmtQty(item.gift_quantity)} ${item.gift_unit === 'box' ? 'صندوق' : 'قطعة'}` : '—'}</td>
                )}
                <td className="small-text">{item.notes || ''}</td>
              </tr>
            ))
          )}

          {/* Totals row */}
          <tr className="totals-row">
            <td colSpan={2} className="totals-label">الإجمالي</td>
            {isReview ? (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.quantity || 0), 0))}</td>
                <td className="center bold">{discrepancies.length > 0 ? `${discrepancies.length} فوارق` : 'مطابق'}</td>
                <td className="center">—</td>
              </>
            ) : isUnload ? (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + i.quantity, 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.surplus_quantity || 0), 0))}</td>
              </>
            ) : (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + i.quantity, 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.gift_quantity || 0), 0))}</td>
              </>
            )}
            <td></td>
          </tr>
        </tbody>
      </table>

      {/* Notes */}
      {session.notes && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: '8px', fontSize: '9pt', borderTop: '1px solid #ccc', paddingTop: '4px' }}>
          <strong>ملاحظات:</strong> {session.notes}
        </div>
      )}

      {/* Footer */}
      <div className="print-footer" style={{ marginTop: '10px' }}>
        <span>Date d'impression: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
        <span>Nombre de produits: {items.length}</span>
        <span>Laser Food</span>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Printer className="w-4 h-4" />
              {getSessionTitle()} - {workerName}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !session ? (
            <div className="text-center py-8 text-muted-foreground">لم يتم العثور على الجلسة</div>
          ) : (
            <>
              {/* Info bar */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{session.worker?.full_name || workerName}</Badge>
                <Badge variant="outline">{format(new Date(session.created_at), 'dd/MM/yyyy HH:mm')}</Badge>
                <Badge variant="outline">{items.length} منتج</Badge>
              </div>

              {/* Preview table */}
              <ScrollArea className="max-h-[55vh]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border p-1 text-center w-8">N°</th>
                        <th className="border border-border p-1.5 text-right">المنتج</th>
                        {isReview ? (
                          <>
                            <th className="border border-border p-1 text-center">نظام</th>
                            <th className="border border-border p-1 text-center">فعلي</th>
                            <th className="border border-border p-1 text-center">الحالة</th>
                          </>
                        ) : isUnload ? (
                          <>
                            <th className="border border-border p-1 text-center">سابق</th>
                            <th className="border border-border p-1 text-center">مُرجع</th>
                            <th className="border border-border p-1 text-center">فائض</th>
                          </>
                        ) : (
                          <>
                            <th className="border border-border p-1 text-center">سابق</th>
                            <th className="border border-border p-1 text-center">مشحون</th>
                            <th className="border border-border p-1 text-center">هدايا</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {isReview ? (
                        <>
                          {discrepancies.map((disc: any, idx: number) => {
                            const item = items.find(i => i.product_id === disc.product_id);
                            return (
                              <tr key={disc.id} className={disc.discrepancy_type === 'deficit' ? 'bg-destructive/5' : 'bg-amber-50/50 dark:bg-amber-950/10'}>
                                <td className="border border-border p-1 text-center text-[10px]">{idx + 1}</td>
                                <td className="border border-border p-1.5 text-right font-medium">{disc.product?.name || '—'}</td>
                                <td className="border border-border p-1 text-center">{item ? fmtQty(item.previous_quantity || 0) : '—'}</td>
                                <td className="border border-border p-1 text-center font-bold">{item ? fmtQty(item.quantity || 0) : '—'}</td>
                                <td className="border border-border p-1 text-center">
                                  <Badge className={`text-[9px] ${disc.discrepancy_type === 'deficit' ? 'bg-destructive text-destructive-foreground' : 'bg-amber-500 text-white'}`}>
                                    {disc.discrepancy_type === 'deficit' ? 'عجز' : 'فائض'} {fmtQty(disc.quantity)}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                          {matchedItems.map((item, idx) => (
                            <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                              <td className="border border-border p-1 text-center text-[10px]">{discrepancies.length + idx + 1}</td>
                              <td className="border border-border p-1.5 text-right">{item.product?.name || '—'}</td>
                              <td className="border border-border p-1 text-center">{fmtQty(item.previous_quantity || 0)}</td>
                              <td className="border border-border p-1 text-center font-bold">{fmtQty(item.quantity || 0)}</td>
                              <td className="border border-border p-1 text-center">
                                <Badge className="bg-primary/80 text-primary-foreground text-[9px]">مطابق</Badge>
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : (
                        items.map((item, idx) => (
                          <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                            <td className="border border-border p-1 text-center text-[10px]">{idx + 1}</td>
                            <td className="border border-border p-1.5 text-right font-medium">{item.product?.name || '—'}</td>
                            <td className="border border-border p-1 text-center">{fmtQty(item.previous_quantity || 0)}</td>
                            <td className="border border-border p-1 text-center font-bold">{fmtQty(item.quantity)}</td>
                            {isUnload ? (
                              <td className="border border-border p-1 text-center">{fmtQty(item.surplus_quantity || 0)}</td>
                            ) : (
                              <td className="border border-border p-1 text-center">
                                {item.gift_quantity > 0 ? fmtQty(item.gift_quantity) : '—'}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>

              <Button onClick={handlePrint} className="w-full gap-2">
                <Printer className="w-4 h-4" />
                طباعة الكشف
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Print portal */}
      {container && printContent && open && createPortal(printContent, container)}
    </>
  );
};

export default SessionPrintView;
