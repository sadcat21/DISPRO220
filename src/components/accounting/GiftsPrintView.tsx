import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';

export interface GiftPrintRow {
  customerName: string;
  address: string;
  wilaya: string;
  phone: string;
  productName: string;
  venteQuantity: number;
  giftQuantity: number;
  workerName: string;
  date: string;
}

interface GiftsPrintViewProps {
  rows: GiftPrintRow[];
  workerName?: string;
  dateRange?: string;
  isVisible?: boolean;
}

const GiftsPrintView = forwardRef<HTMLDivElement, GiftsPrintViewProps>(
  ({ rows, workerName, dateRange, isVisible = false }, ref) => {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);

    const totalVente = rows.reduce((s, r) => s + r.venteQuantity, 0);
    const totalGift = rows.reduce((s, r) => s + r.giftQuantity, 0);

    const minRows = 20;
    const emptyRowsCount = Math.max(0, minRows - rows.length);

    useEffect(() => {
      // Remove existing portal if any
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
      `Produit: جميع المنتجات`,
      `Période: ${dateRange || ''}`,
    ].join('  |  ');

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
              <th style={{ width: '35px' }}>N°</th>
              <th>Nom</th>
              <th>Adresse</th>
              <th style={{ width: '70px' }}>Wilaya</th>
              <th style={{ width: '100px' }}>Téléphone</th>
              <th>Produit</th>
              <th style={{ width: '50px' }}>Ventes</th>
              <th style={{ width: '50px' }}>Gratuit</th>
              <th>Employé</th>
              <th style={{ width: '75px' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="center">{index + 1}</td>
                <td>{row.customerName}</td>
                <td className="small-text">{row.address}</td>
                <td>{row.wilaya}</td>
                <td className="ltr-text">{row.phone}</td>
                <td>{row.productName}</td>
                <td className="center bold">{row.venteQuantity}</td>
                <td className="center bold">{row.giftQuantity}</td>
                <td className="small-text">{row.workerName}</td>
                <td className="small-text">{row.date ? format(new Date(row.date), 'dd/MM/yyyy') : ''}</td>
              </tr>
            ))}

            {Array.from({ length: emptyRowsCount }).map((_, i) => (
              <tr key={`empty-${i}`}>
                {Array.from({ length: 10 }).map((_, j) => (
                  <td key={j}>&nbsp;</td>
                ))}
              </tr>
            ))}

            <tr className="totals-row">
              <td colSpan={6} className="totals-label">Total</td>
              <td className="center bold">{totalVente}</td>
              <td className="center bold">{totalGift}</td>
              <td colSpan={2}></td>
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
