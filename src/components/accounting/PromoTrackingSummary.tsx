import React from 'react';
import { Gift, Package } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { PromoTrackingItem } from '@/hooks/useSessionCalculations';

interface PromoTrackingSummaryProps {
  items: PromoTrackingItem[];
  totalGiftValue: number;
}

/**
 * Format gift quantity as mixed boxes.pieces display
 * Integer part = boxes, decimal part = pieces (padded to 2 digits)
 * e.g. 7 pieces (ppb=24) → "0.07", 10 pieces → "0.10", 
 *      24 pieces (ppb=24) → "1.00", 29 pieces → "1.05"
 */
const formatGiftDisplay = (giftPieces: number, piecesPerBox: number): string => {
  if (piecesPerBox <= 0) return `${giftPieces} قطعة`;
  const boxes = Math.floor(giftPieces / piecesPerBox);
  const remainingPieces = giftPieces % piecesPerBox;
  const piecesStr = remainingPieces.toString().padStart(2, '0');
  return `${boxes}.${piecesStr}`;
};

const formatGiftLabel = (giftPieces: number, piecesPerBox: number): string => {
  if (piecesPerBox <= 0) return `${giftPieces} قطعة`;
  const boxes = Math.floor(giftPieces / piecesPerBox);
  const remainingPieces = giftPieces % piecesPerBox;
  const parts: string[] = [];
  if (boxes > 0) parts.push(`${boxes} صندوق`);
  if (remainingPieces > 0) parts.push(`${remainingPieces} قطعة`);
  if (parts.length === 0) return '0';
  return parts.join(' و ');
};

const PromoTrackingSummary: React.FC<PromoTrackingSummaryProps> = ({ items, totalGiftValue }) => {
  const { t } = useLanguage();

  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-3 text-sm">
        لا توجد عروض مطبقة في هذه الفترة
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Gift value summary */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
            القيمة المالية للهدايا
          </span>
        </div>
        <span className="font-bold text-purple-600">{totalGiftValue.toLocaleString()} DA</span>
      </div>

      {/* Promo items table */}
      <div className="bg-muted/30 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-1 text-[10px] text-muted-foreground font-medium p-2 border-b">
          <span className="col-span-4">{t('stock.product') || 'المنتج'}</span>
          <span className="col-span-2 text-center">المبيعات</span>
          <span className="col-span-3 text-center">الهدايا</span>
          <span className="col-span-3 text-end">العرض</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-1 text-xs p-2 border-b border-dashed last:border-0 items-center">
            <div className="col-span-4 flex items-center gap-1.5">
              <Package className="w-3 h-3 text-muted-foreground shrink-0" />
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
        ))}
      </div>
    </div>
  );
};

export default PromoTrackingSummary;
