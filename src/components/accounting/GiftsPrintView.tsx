import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';
import { GiftPrintColumnKey } from './GiftsPrintSettingsDialog';

export interface GiftPrintRow {
  customerName: string;
  customerNameFr: string;
  storeName: string;
  sector: string;
  address: string;
  wilaya: string;
  phone: string;
  productName: string;
  venteQuantity: number;
  giftQuantity: number;
  giftBoxPiece: string; // e.g. "1.13"
  workerName: string;
  date: string;
}

interface GiftsPrintViewProps {
  rows: GiftPrintRow[];
  workerName?: string;
  dateRange?: string;
  productFilter?: string;
  isVisible?: boolean;
  visibleColumns?: GiftPrintColumnKey[];
}

const COLUMN_CONFIG: Record<GiftPrintColumnKey, { header: string; width?: string; className?: string }> = {
  number: { header: 'N°', width: '30px', className: 'center' },
  customerName: { header: 'Nom', className: '' },
  customerNameFr: { header: 'Nom FR', className: '' },
  storeName: { header: 'Magasin', className: '' },
  sector: { header: 'Secteur', className: '' },
  address: { header: 'Adresse', className: 'small-text' },
  wilaya: { header: 'Wilaya', width: '65px' },
  phone: { header: 'Téléphone', width: '95px', className: 'ltr-text' },
  productName: { header: 'Produit', className: '' },
  venteQuantity: { header: 'Ventes', width: '45px', className: 'center bold' },
  giftQuantity: { header: 'Gratuit', width: '45px', className: 'center bold' },
  giftBoxPiece: { header: 'Gratuit B.P', width: '55px', className: 'center bold' },
  workerName: { header: 'Employé', className: 'small-text' },
  date: { header: 'Date', width: '70px', className: 'small-text' },
};

const getCellValue = (row: GiftPrintRow, col: GiftPrintColumnKey, index: number): React.ReactNode => {
  switch (col) {
    case 'number': return index + 1;
    case 'customerName': return row.customerName;
    case 'customerNameFr': return row.customerNameFr || '-';
    case 'storeName': return row.storeName || '-';
    case 'sector': return row.sector || '-';
    case 'address': return row.address;
    case 'wilaya': return row.wilaya;
    case 'phone': return row.phone;
    case 'productName': return row.productName;
    case 'venteQuantity': return row.venteQuantity;
    case 'giftQuantity': return row.giftQuantity;
    case 'giftBoxPiece': return row.giftBoxPiece;
    case 'workerName': return row.workerName;
    case 'date': return row.date ? format(new Date(row.date), 'dd/MM/yyyy') : '';
    default: return '';
  }
};

const GiftsPrintView = forwardRef<HTMLDivElement, GiftsPrintViewProps>(
  ({ rows, workerName, dateRange, productFilter, isVisible = false, visibleColumns }, ref) => {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);

    const columns = visibleColumns || ['number', 'customerName', 'address', 'wilaya', 'phone', 'productName', 'venteQuantity', 'giftBoxPiece', 'workerName', 'date'];

    const totalVente = rows.reduce((s, r) => s + r.venteQuantity, 0);
    const totalGift = rows.reduce((s, r) => s + r.giftQuantity, 0);

    const minRows = 20;
    const emptyRowsCount = Math.max(0, minRows - rows.length);

    // Find column indices for totals placement
    const venteColIdx = columns.indexOf('venteQuantity');
    const giftColIdx = columns.indexOf('giftQuantity');
    const giftBPColIdx = columns.indexOf('giftBoxPiece');

    useEffect(() => {
      const existing = document.getElementById('gifts-print-portal');
      if (existing) existing.remove();

      const div = document.createElement('div');
      div.id = 'gifts-print-portal';
      document.body.appendChild(div);
      setContainer(div);
      return () => {
        if (div.parentNode) div.parentNode.removeChild(div);
      };
    }, []);

    const filterCriteria = [
      `Employé: ${workerName || 'جميع العمال'}`,
      `Produit: ${productFilter || 'جميع المنتجات'}`,
      `Période: ${dateRange || ''}`,
    ].join('  |  ');

    // Build totals row cells
    const buildTotalsRow = () => {
      // Find first total column
      const totalIndices = [venteColIdx, giftColIdx, giftBPColIdx].filter(i => i >= 0);
      if (totalIndices.length === 0) {
        return <td colSpan={columns.length} className="totals-label">Total</td>;
      }
      const firstTotalIdx = Math.min(...totalIndices);
      const cells: React.ReactNode[] = [];

      if (firstTotalIdx > 0) {
        cells.push(<td key="label" colSpan={firstTotalIdx} className="totals-label">Total</td>);
      }

      for (let i = firstTotalIdx; i < columns.length; i++) {
        const col = columns[i];
        if (col === 'venteQuantity') {
          cells.push(<td key={col} className="center bold">{totalVente}</td>);
        } else if (col === 'giftQuantity') {
          cells.push(<td key={col} className="center bold">{totalGift}</td>);
        } else if (col === 'giftBoxPiece') {
          cells.push(<td key={col} className="center bold">-</td>);
        } else {
          cells.push(<td key={col}></td>);
        }
      }
      return cells;
    };

    const content = (
      <div
        ref={ref}
        className="print-container"
        dir="rtl"
        style={{
          display: isVisible ? 'block' : 'none',
          position: 'relative',
          minHeight: '100vh',
        }}
      >
        {/* Watermark */}
        <div style={{
          position: 'absolute', top: '45%', left: '50%',
          transform: 'translate(-50%, -50%)', zIndex: 0,
          opacity: 0.2, pointerEvents: 'none',
        }}>
          <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
        </div>

        {/* Header */}
        <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
          <div className="print-title-section">
            <h1>Registre des promotions</h1>
            <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '5px' }}>
              {filterCriteria}
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
              {columns.map(col => {
                const cfg = COLUMN_CONFIG[col];
                return (
                  <th key={col} style={cfg.width ? { width: cfg.width } : undefined}>
                    {cfg.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map(col => {
                  const cfg = COLUMN_CONFIG[col];
                  return (
                    <td key={col} className={cfg.className || ''}>
                      {getCellValue(row, col, index)}
                    </td>
                  );
                })}
              </tr>
            ))}

            {Array.from({ length: emptyRowsCount }).map((_, i) => (
              <tr key={`empty-${i}`}>
                {columns.map((col, j) => (
                  <td key={j}>&nbsp;</td>
                ))}
              </tr>
            ))}

            <tr className="totals-row">
              {buildTotalsRow()}
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="print-footer">
          <span>Date d'impression: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
          <span>Laser Food</span>
        </div>
      </div>
    );

    if (!container) return null;
    return createPortal(content, container);
  }
);

GiftsPrintView.displayName = 'GiftsPrintView';

export default GiftsPrintView;
