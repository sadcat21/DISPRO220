import React, { useState, useRef, useCallback } from 'react';
import { Gift, Package, ChevronDown, ChevronUp, User, Calendar, Printer } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { PromoTrackingItem } from '@/hooks/useSessionCalculations';
import { Button } from '@/components/ui/button';
import PromoDetailsPrintView from '@/components/print/PromoDetailsPrintView';

interface PromoTrackingSummaryProps {
  items: PromoTrackingItem[];
  totalGiftValue?: number;
  workerName?: string;
}

const formatGiftDisplay = (giftPieces: number, piecesPerBox: number): string => {
  if (piecesPerBox <= 0) return `${giftPieces} قطعة`;
  const boxes = Math.floor(giftPieces / piecesPerBox);
  const remainingPieces = giftPieces % piecesPerBox;
  const piecesStr = remainingPieces.toString().padStart(2, '0');
  return `${boxes}.${piecesStr}`;
};

const formatGiftLabel = (giftPieces: number, _piecesPerBox: number): string => {
  if (giftPieces <= 0) return '0';
  return `${giftPieces} قطعة`;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
};

const PromoTrackingSummary: React.FC<PromoTrackingSummaryProps> = ({ items, totalGiftValue, workerName }) => {
  const { t } = useLanguage();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [printingIdx, setPrintingIdx] = useState<number | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback((idx: number) => {
    setPrintingIdx(idx);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintingIdx(null), 500);
    }, 300);
  }, []);

  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-3 text-sm">
        لا توجد عروض مطبقة في هذه الفترة
      </p>
    );
  }

  const printItem = printingIdx !== null ? items[printingIdx] : null;

  return (
    <div className="space-y-2">
      {/* Promo items table */}
      <div className="bg-muted/30 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-1 text-[10px] text-muted-foreground font-medium p-2 border-b">
          <span className="col-span-4">{t('stock.product') || 'المنتج'}</span>
          <span className="col-span-2 text-center">المبيعات</span>
          <span className="col-span-3 text-center">الهدايا</span>
          <span className="col-span-3 text-end">العرض</span>
        </div>
        {items.map((item, idx) => {
          const isExpanded = expandedIdx === idx;
          const hasDetails = item.customerDetails && item.customerDetails.length > 0;
          return (
            <div key={idx}>
              <div
                className={`grid grid-cols-12 gap-1 text-xs p-2 border-b border-dashed last:border-0 items-center ${hasDetails ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
                onClick={() => hasDetails && setExpandedIdx(isExpanded ? null : idx)}
              >
                <div className="col-span-4 flex items-center gap-1.5">
                  {hasDetails ? (
                    isExpanded ? <ChevronUp className="w-3 h-3 text-primary shrink-0" /> : <ChevronDown className="w-3 h-3 text-primary shrink-0" />
                  ) : (
                    <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-wrap">{item.productName}</span>
                </div>
                <span className="col-span-2 text-center font-bold">{item.quantitySold}</span>
                <div className="col-span-3 text-center">
                  <span className="font-bold text-purple-600" title={formatGiftLabel(item.giftQuantity, item.piecesPerBox)}>
                    {formatGiftDisplay(item.giftQuantity, item.piecesPerBox)} 🎁
                  </span>
                  <div className="text-[9px] text-muted-foreground">
                    {formatGiftLabel(item.giftQuantity, item.piecesPerBox)}
                  </div>
                </div>
                <span className="col-span-3 text-end text-muted-foreground text-[10px]">
                  {item.offerName || '-'}
                </span>
              </div>

              {/* Expanded customer details */}
              {isExpanded && hasDetails && (
                <div className="bg-accent/30 border-t border-border">
                  {/* Print button */}
                  <div className="flex justify-end px-3 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-[10px] h-7 rounded-lg print:hidden"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint(idx);
                      }}
                    >
                      <Printer className="w-3 h-3" />
                      طباعة
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-1 text-[9px] text-muted-foreground font-medium px-3 py-1.5 border-b border-border/50">
                    <span className="col-span-4">العميل</span>
                    <span className="col-span-2 text-center">الكمية</span>
                    <span className="col-span-3 text-center">الهدية</span>
                    <span className="col-span-3 text-end">التاريخ</span>
                  </div>
                  {item.customerDetails.map((cd, cdIdx) => (
                    <div key={cdIdx} className="grid grid-cols-12 gap-1 text-[11px] px-3 py-1.5 border-b border-dashed border-border/30 last:border-0 items-center">
                      <div className="col-span-4 flex items-center gap-1">
                        <User className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="truncate">
                          {cd.customerStoreName && (
                            <span className="font-bold text-[11px]">{cd.customerStoreName} - </span>
                          )}
                          <span className="text-muted-foreground">{cd.customerName || '-'}</span>
                        </div>
                      </div>
                      <span className="col-span-2 text-center font-semibold">{cd.quantitySold}</span>
                      <div className="col-span-3 text-center">
                        <span className="font-semibold text-purple-600">
                          {formatGiftDisplay(cd.giftPieces, item.piecesPerBox)}
                        </span>
                        <div className="text-[8px] text-muted-foreground">
                          {formatGiftLabel(cd.giftPieces, item.piecesPerBox)}
                        </div>
                      </div>
                      <div className="col-span-3 text-end flex items-center justify-end gap-0.5 text-muted-foreground">
                        <Calendar className="w-2.5 h-2.5 shrink-0" />
                        <span className="text-[9px]">{formatDate(cd.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Print view (hidden, rendered via portal) */}
      {printItem && (
        <PromoDetailsPrintView
          ref={printRef}
          productName={printItem.productName}
          workerName={workerName}
          piecesPerBox={printItem.piecesPerBox}
          customerDetails={printItem.customerDetails}
          isVisible={printingIdx !== null}
        />
      )}
    </div>
  );
};

export default PromoTrackingSummary;
