import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';
import { useLanguage } from '@/contexts/LanguageContext';
import { PromoCustomerDetail } from '@/hooks/useSessionCalculations';

interface PromoDetailsPrintViewProps {
  productName: string;
  workerName?: string;
  piecesPerBox: number;
  customerDetails: PromoCustomerDetail[];
  isVisible?: boolean;
}

const formatGiftDisplay = (giftPieces: number, piecesPerBox: number): string => {
  if (piecesPerBox <= 0) return `${giftPieces}`;
  const boxes = Math.floor(giftPieces / piecesPerBox);
  const remainingPieces = giftPieces % piecesPerBox;
  const piecesStr = remainingPieces.toString().padStart(2, '0');
  return `${boxes}.${piecesStr}`;
};

const formatGiftLabel = (giftPieces: number, _piecesPerBox: number): string => {
  if (giftPieces <= 0) return '0';
  return `${giftPieces} قطعة`;
};

const PromoDetailsPrintView = forwardRef<HTMLDivElement, PromoDetailsPrintViewProps>(
  ({ productName, workerName, piecesPerBox, customerDetails, isVisible = false }, ref) => {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const { tp, printDir } = useLanguage();

    const totalSold = customerDetails.reduce((sum, cd) => sum + cd.quantitySold, 0);
    const totalGiftPieces = customerDetails.reduce((sum, cd) => sum + cd.giftPieces, 0);

    const minRows = 20;
    const emptyRowsCount = Math.max(0, minRows - customerDetails.length);

    useEffect(() => {
      const div = document.createElement('div');
      div.id = 'print-portal-promo-details';
      document.body.appendChild(div);
      setContainer(div);
      return () => { document.body.removeChild(div); };
    }, []);

    const content = (
      <div
        ref={ref}
        className="print-container"
        dir="rtl"
        style={{
          display: isVisible ? 'block' : 'none',
          position: 'relative',
          minHeight: '100vh'
        }}
      >
        {/* Watermark */}
        <div style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
          opacity: 0.2,
          pointerEvents: 'none'
        }}>
          <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
        </div>

        {/* Header */}
        <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
          <div className="print-title-section">
            <h1>تفاصيل العروض المسلمة</h1>
            <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '5px' }}>
              المنتج: {productName}
              {workerName && ` | العامل: ${workerName}`}
            </p>
          </div>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
        </div>

        {/* Table */}
        <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
          <thead>
            <tr>
              <th style={{ width: '35px' }}>رقم</th>
              <th>المحل / العميل</th>
              <th style={{ width: '100px' }}>الهاتف</th>
              <th>العنوان</th>
              <th style={{ width: '70px' }}>الكمية المشتراة</th>
              <th style={{ width: '90px' }}>الهدية المسلمة</th>
              <th style={{ width: '100px' }}>التاريخ والتوقيت</th>
            </tr>
          </thead>
          <tbody>
            {customerDetails.map((cd, index) => (
              <tr key={index}>
                <td className="center">{index + 1}</td>
                <td>
                  {cd.customerStoreName && <strong>{cd.customerStoreName}</strong>}
                  {cd.customerStoreName && cd.customerName ? ' - ' : ''}
                  {cd.customerName || '-'}
                </td>
                <td className="ltr-text">{cd.customerPhone || '-'}</td>
                <td className="small-text">{cd.customerAddress || '-'}</td>
                <td className="center bold">{cd.quantitySold}</td>
                <td className="center bold">
                  <div>{formatGiftDisplay(cd.giftPieces, piecesPerBox)}</div>
                  <div style={{ fontSize: '7pt', fontWeight: 'normal', opacity: 0.7 }}>
                    {formatGiftLabel(cd.giftPieces, piecesPerBox)}
                  </div>
                </td>
                <td className="small-text center">
                  {cd.date ? format(new Date(cd.date), 'dd/MM/yyyy HH:mm') : '-'}
                </td>
              </tr>
            ))}

            {/* Empty rows */}
            {Array.from({ length: emptyRowsCount }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td className="center">&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}

            {/* Totals */}
            <tr className="totals-row">
              <td colSpan={4} className="totals-label">المجموع</td>
              <td className="center bold">{totalSold}</td>
              <td className="center bold">
                <div>{formatGiftDisplay(totalGiftPieces, piecesPerBox)}</div>
                <div style={{ fontSize: '7pt', fontWeight: 'normal', opacity: 0.7 }}>
                  {formatGiftLabel(totalGiftPieces, piecesPerBox)}
                </div>
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="print-footer">
          <span>تاريخ الطباعة: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
          <span>Laser Food</span>
        </div>
      </div>
    );

    if (!container) return null;
    return createPortal(content, container);
  }
);

PromoDetailsPrintView.displayName = 'PromoDetailsPrintView';

export default PromoDetailsPrintView;
