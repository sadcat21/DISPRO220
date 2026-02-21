import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PromoWithDetails } from '@/types/database';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';
import { useLanguage } from '@/contexts/LanguageContext';

interface PromoPrintViewProps {
  promos: PromoWithDetails[];
  title?: string;
  workerName?: string;
  dateRange?: string;
  productName?: string;
  isVisible?: boolean;
}

const PromoPrintView = forwardRef<HTMLDivElement, PromoPrintViewProps>(
  ({ promos, title, workerName, dateRange, productName, isVisible = false }, ref) => {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const { tp, printDir } = useLanguage();
    
    // Use translated title if not provided
    const displayTitle = title || tp('print.promo.title');
    
    const totalVente = promos.reduce((sum, p) => sum + p.vente_quantity, 0);
    const totalGratuite = promos.reduce((sum, p) => sum + p.gratuite_quantity, 0);

    // Generate empty rows to fill the page
    const minRows = 20;
    const emptyRowsCount = Math.max(0, minRows - promos.length);

    useEffect(() => {
      // Create container directly in body for printing
      const div = document.createElement('div');
      div.id = 'print-portal';
      document.body.appendChild(div);
      setContainer(div);
      
      return () => {
        document.body.removeChild(div);
      };
    }, []);

    // Build filter criteria text - always show all criteria
    const getFilterCriteria = () => {
      const criteria: string[] = [];
      
      // Always show worker filter
      criteria.push(`${tp('print.promo.worker_filter')}: ${workerName || tp('print.promo.all_workers')}`);
      
      // Always show product filter
      criteria.push(`${tp('print.promo.product_filter')}: ${productName || tp('print.promo.all_products')}`);
      
      // Always show date range
      if (dateRange) {
        criteria.push(`${tp('print.header.period')}: ${dateRange}`);
      }
      
      return criteria;
    };

    const filterCriteria = getFilterCriteria();

    const content = (
      <div 
        ref={ref} 
        className="print-container" 
        dir={printDir} 
        style={{ 
          display: isVisible ? 'block' : 'none',
          position: 'relative',
          minHeight: '100vh'
        }}
      >
        {/* Watermark - absolutely positioned in center of container */}
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

        {/* Header with Logo */}
        <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
          <div className="print-title-section">
            <h1>{displayTitle}</h1>
            {filterCriteria.length > 0 && (
              <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '5px' }}>
                {filterCriteria.join('  |  ')}
              </p>
            )}
          </div>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
        </div>

        {/* Main Table - Word-like style */}
        <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
          <thead>
            <tr>
              <th style={{ width: '35px' }}>{tp('print.header.number')}</th>
              <th>{tp('print.promo.name')}</th>
              <th>{tp('print.promo.address')}</th>
              <th style={{ width: '70px' }}>{tp('print.promo.wilaya')}</th>
              <th style={{ width: '100px' }}>{tp('print.promo.phone')}</th>
              <th>{tp('print.promo.product')}</th>
              <th style={{ width: '50px' }}>{tp('print.promo.sales')}</th>
              <th style={{ width: '50px' }}>{tp('print.promo.free')}</th>
              <th>{tp('print.promo.worker')}</th>
              <th style={{ width: '75px' }}>{tp('print.promo.date')}</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((promo, index) => (
              <tr key={promo.id}>
                <td className="center">{index + 1}</td>
                <td>{promo.customer?.name || ''}</td>
                <td className="small-text">{promo.customer?.address || ''}</td>
                <td>{promo.customer?.wilaya || ''}</td>
                <td className="ltr-text">{promo.customer?.phone || ''}</td>
                <td>{promo.product?.name || ''}</td>
                <td className="center bold">{promo.vente_quantity}</td>
                <td className="center bold">{promo.gratuite_quantity}</td>
                <td className="small-text">{promo.worker?.full_name || ''}</td>
                <td className="small-text">{format(new Date(promo.promo_date), 'dd/MM/yyyy')}</td>
              </tr>
            ))}
            
            {/* Empty rows to fill the page */}
            {Array.from({ length: emptyRowsCount }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td className="center">&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
            
            {/* Totals row */}
            <tr className="totals-row">
              <td colSpan={6} className="totals-label">{tp('print.promo.total')}</td>
              <td className="center bold">{totalVente}</td>
              <td className="center bold">{totalGratuite}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="print-footer">
          <span>{tp('print.header.print_date')}: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
          <span>Laser Food</span>
        </div>
      </div>
    );

    // Render directly into body using portal
    if (!container) return null;
    return createPortal(content, container);
  }
);

PromoPrintView.displayName = 'PromoPrintView';

export default PromoPrintView;