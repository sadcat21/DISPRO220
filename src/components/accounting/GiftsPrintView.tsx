import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';
import { GiftPrintColumnKey } from './GiftsPrintSettingsDialog';

export interface GiftPrintRow {
  customerName: string;
  customerNameFr: string;
  storeName: string;
  storeNameFr: string;
  sector: string;
  address: string;
  wilaya: string;
  phone: string;
  productName: string;
  offerDetail: string;
  venteQuantity: number;
  giftQuantity: number;
  giftBoxPiece: string;
  workerName: string;
  date: string;
  piecesPerBox: number;
}

export interface SummaryRow {
  productName: string;
  offerDetail: string;
  workerGifts: Record<string, number>; // workerName -> giftPieces
  piecesPerBox: number;
}

interface GiftsPrintViewProps {
  rows: GiftPrintRow[];
  summaryRows?: SummaryRow[];
  workerNames?: string[];
  workerName?: string;
  dateRange?: string;
  productFilter?: string;
  isVisible?: boolean;
  visibleColumns?: GiftPrintColumnKey[];
  separateByProduct?: boolean;
  printSummary?: boolean;
  summaryOnly?: boolean;
  isTemplate?: boolean;
  templatePageCount?: number;
  templateProductName?: string;
  templateOfferDetail?: string;
}

const ROWS_PER_PAGE = 20;

const COLUMN_CONFIG: Record<GiftPrintColumnKey, { header: string; width?: string; className?: string }> = {
  number: { header: 'N°', width: '30px', className: 'center' },
  customerName: { header: 'Nom AR', className: '' },
  customerNameFr: { header: 'Nom FR', className: '' },
  storeName: { header: 'Magasin AR', className: '' },
  storeNameFr: { header: 'Magasin FR', className: '' },
  sector: { header: 'Secteur', className: '' },
  address: { header: 'Adresse', className: 'small-text' },
  wilaya: { header: 'Wilaya', width: '65px' },
  phone: { header: 'Téléphone', width: '95px', className: 'ltr-text' },
  productName: { header: 'Produit', className: '' },
  venteQuantity: { header: 'Ventes', width: '45px', className: 'center bold' },
  giftQuantity: { header: 'Gratuit', width: '45px', className: 'center bold' },
  giftBoxPiece: { header: 'Gratuit B.P', width: '55px', className: 'center bold' },
  workerName: { header: 'Employé', className: 'small-text' },
  date: { header: 'Date', width: '85px', className: 'small-text' },
};

type PrintPage = {
  productName: string | null;
  rows: GiftPrintRow[];
  rowOffset: number;
  showTotals: boolean;
  totals: { vente: number; gift: number; giftBoxPiece: string };
  pageNum: number;
  totalPages: number;
};

const chunkRows = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
};

const formatGiftTotalBoxPiece = (rows: GiftPrintRow[]): string => {
  if (!rows.length) return '0.00';
  let totalPieces = 0;
  let ppb = rows[0]?.piecesPerBox || 1;
  const ppbMap = new Map<number, number>();
  rows.forEach(r => {
    ppbMap.set(r.piecesPerBox, (ppbMap.get(r.piecesPerBox) || 0) + r.giftQuantity);
    totalPieces += r.giftQuantity;
  });
  let maxCount = 0;
  ppbMap.forEach((count, key) => {
    if (count > maxCount) { maxCount = count; ppb = key; }
  });
  if (ppb <= 1) return `${totalPieces}.00`;
  const boxes = Math.floor(totalPieces / ppb);
  const rem = totalPieces % ppb;
  return `${boxes}.${String(rem).padStart(2, '0')}`;
};

const formatBoxPiece = (pieces: number, ppb: number): string => {
  if (ppb <= 1) return `${pieces}.00`;
  const boxes = Math.floor(pieces / ppb);
  const rem = pieces % ppb;
  return `${boxes}.${String(rem).padStart(2, '0')}`;
};

const getCellValue = (row: GiftPrintRow, col: GiftPrintColumnKey, rowNumber: number): React.ReactNode => {
  switch (col) {
    case 'number': return rowNumber;
    case 'customerName': return row.customerName;
    case 'customerNameFr': return row.customerNameFr || '-';
    case 'storeName': return row.storeName || '-';
    case 'storeNameFr': return row.storeNameFr || '-';
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
  ({ rows, summaryRows, workerNames, workerName, dateRange, productFilter, isVisible = false, visibleColumns, separateByProduct = true, printSummary = false, summaryOnly = false, isTemplate = false, templatePageCount = 2, templateProductName = '', templateOfferDetail = '' }, ref) => {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);

    const columns = useMemo(() => {
      let cols = visibleColumns || [
        'number', 'customerNameFr', 'phone', 'sector',
        'venteQuantity', 'giftBoxPiece', 'date', 'workerName',
      ] as GiftPrintColumnKey[];
      if (separateByProduct) {
        cols = cols.filter(c => c !== 'productName');
      }
      return cols;
    }, [visibleColumns, separateByProduct]);

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

    const workerLabel = workerName === 'جميع العمال' ? 'Tous les employés' : (workerName || 'Tous les employés');
    const productLabel = (!productFilter || productFilter === 'جميع المنتجات' || productFilter === 'Tous les produits') ? 'Tous les produits' : productFilter;

    const filterParts = [`Employé: ${workerLabel}`];
    if (!separateByProduct) {
      filterParts.push(`Produit: ${productLabel}`);
    }
    filterParts.push(`Période: ${dateRange || ''}`);
    const filterCriteria = filterParts.join('  |  ');

    const pages = useMemo((): PrintPage[] => {
      if (!rows.length && !isTemplate) {
        return [{ productName: null, rows: [], rowOffset: 0, showTotals: true, totals: { vente: 0, gift: 0, giftBoxPiece: '0.00' }, pageNum: 1, totalPages: 1 }];
      }

      // Template mode: generate empty pages
      if (isTemplate) {
        const templatePages: PrintPage[] = [];
        const numTemplatePages = templatePageCount;
        for (let i = 0; i < numTemplatePages; i++) {
          templatePages.push({
            productName: null,
            rows: [],
            rowOffset: i * ROWS_PER_PAGE,
            showTotals: true,
            totals: { vente: 0, gift: 0, giftBoxPiece: '' },
            pageNum: i + 1,
            totalPages: numTemplatePages,
          });
        }
        return templatePages;
      }

      if (!separateByProduct) {
        const totals = {
          vente: rows.reduce((s, r) => s + r.venteQuantity, 0),
          gift: rows.reduce((s, r) => s + r.giftQuantity, 0),
          giftBoxPiece: formatGiftTotalBoxPiece(rows),
        };
        const chunks = chunkRows(rows, ROWS_PER_PAGE);
        return chunks.map((chunk, idx) => ({
          productName: null,
          rows: chunk,
          rowOffset: idx * ROWS_PER_PAGE,
          showTotals: idx === chunks.length - 1,
          totals,
          pageNum: idx + 1,
          totalPages: chunks.length,
        }));
      }

      // Group by product + offer tier detail for separate pages
      const grouped = new Map<string, { productName: string; offerDetail: string; rows: GiftPrintRow[] }>();
      rows.forEach((row) => {
        const groupKey = `${row.productName}|||${row.offerDetail || ''}`;
        if (!grouped.has(groupKey)) grouped.set(groupKey, { productName: row.productName, offerDetail: row.offerDetail || '', rows: [] });
        grouped.get(groupKey)!.rows.push(row);
      });

      const builtPages: PrintPage[] = [];
      for (const [, group] of grouped.entries()) {
        const productRows = group.rows;
        const tierLabel = group.offerDetail
          ? `${group.productName} — ${group.offerDetail}`
          : group.productName;
        const totals = {
          vente: productRows.reduce((s, r) => s + r.venteQuantity, 0),
          gift: productRows.reduce((s, r) => s + r.giftQuantity, 0),
          giftBoxPiece: formatGiftTotalBoxPiece(productRows),
        };
        const chunks = chunkRows(productRows, ROWS_PER_PAGE);
        chunks.forEach((chunk, idx) => {
          builtPages.push({
            productName: tierLabel,
            rows: chunk,
            rowOffset: idx * ROWS_PER_PAGE,
            showTotals: idx === chunks.length - 1,
            totals,
            pageNum: idx + 1,
            totalPages: chunks.length,
          });
        });
      }

      return builtPages;
    }, [rows, separateByProduct, isTemplate, templatePageCount]);

    const buildTotalsRow = (totals: { vente: number; gift: number; giftBoxPiece: string }) => {
      const totalIndices = [venteColIdx, giftColIdx, giftBPColIdx].filter(i => i >= 0);
      if (totalIndices.length === 0) {
        return <td colSpan={columns.length} className="totals-label">Total</td>;
      }

      const firstTotalIdx = Math.min(...totalIndices);
      const cells: React.ReactNode[] = [];

      if (firstTotalIdx > 0) {
        cells.push(
          <td key="label" colSpan={firstTotalIdx} className="totals-label">Total</td>
        );
      }

      for (let i = firstTotalIdx; i < columns.length; i++) {
        const col = columns[i];
        if (col === 'venteQuantity') {
          cells.push(<td key={col} className="center bold">{totals.vente}</td>);
        } else if (col === 'giftQuantity') {
          cells.push(<td key={col} className="center bold">{totals.gift}</td>);
        } else if (col === 'giftBoxPiece') {
          cells.push(<td key={col} className="center bold">{totals.giftBoxPiece}</td>);
        } else {
          cells.push(<td key={col}></td>);
        }
      }

      return cells;
    };

    // Build summary page
    const summaryContent = useMemo(() => {
      if (!printSummary || !summaryRows?.length || !workerNames?.length) return null;
      
      return (
        <section
          className="print-page"
          style={{ pageBreakBefore: summaryOnly ? 'auto' : 'always' }}
        >
          <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, opacity: 0.2, pointerEvents: 'none' }}>
            <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
          </div>

          <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
            <div className="print-logo"><img src={logoImage} alt="Laser Food" /></div>
            <div className="print-title-section">
              <h1 style={{ fontSize: '16pt' }}>Résumé des promotions par employé</h1>
              <p style={{ fontSize: '10pt', fontWeight: 600, marginTop: '5px' }}>{filterCriteria}</p>
            </div>
            <div className="print-logo"><img src={logoImage} alt="Laser Food" /></div>
          </div>

          <table className="word-table" dir="ltr" style={{ position: 'relative', zIndex: 1 }}>
            <thead>
              <tr>
                <th>Produit</th>
                <th>Offre</th>
                {workerNames.map(w => <th key={w} style={{ fontSize: '8pt' }}>{w}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((sr, idx) => {
                const totalPieces = Object.values(sr.workerGifts).reduce((s, v) => s + v, 0);
                return (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{sr.productName}</td>
                    <td className="small-text">{sr.offerDetail}</td>
                    {workerNames.map(w => {
                      const pieces = sr.workerGifts[w] || 0;
                      return (
                        <td key={w} className="center bold">
                          {pieces > 0 ? formatBoxPiece(pieces, sr.piecesPerBox) : '-'}
                        </td>
                      );
                    })}
                    <td className="center bold">{formatBoxPiece(totalPieces, sr.piecesPerBox)}</td>
                  </tr>
                );
              })}
              {/* Totals row per worker */}
              <tr className="totals-row">
                <td colSpan={2} className="totals-label">Total</td>
                {workerNames.map(w => {
                  const total = summaryRows.reduce((s, sr) => s + (sr.workerGifts[w] || 0), 0);
                  return <td key={w} className="center bold">{total > 0 ? total : '-'}</td>;
                })}
                <td className="center bold">
                  {summaryRows.reduce((s, sr) => s + Object.values(sr.workerGifts).reduce((a, b) => a + b, 0), 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* No footer */}
        </section>
      );
    }, [printSummary, summaryRows, workerNames, filterCriteria]);

    const content = (
      <div
        ref={ref}
        className="print-container"
        style={{ display: isVisible ? 'block' : 'none' }}
      >
        {!summaryOnly && pages.map((page, pageIndex) => {
          const emptyRowsCount = Math.max(0, ROWS_PER_PAGE - page.rows.length);
          const templateDots = '·······················';
          const pageSuffix = page.totalPages > 1 ? ` (${page.pageNum}/${page.totalPages})` : '';
          
          // Build template title with optional product/offer
          let templateTitle = 'Registre des promotions';
          if (isTemplate) {
            const parts: string[] = [];
            if (templateProductName) parts.push(templateProductName);
            else parts.push(templateDots);
            if (templateOfferDetail) parts.push(templateOfferDetail);
            templateTitle = `Registre des promotions — ${parts.join(' — ')}${pageSuffix}`;
          }
          
          const pageTitle = isTemplate
            ? templateTitle
            : page.productName
              ? `Registre des promotions — ${page.productName}${pageSuffix}`
              : `Registre des promotions${pageSuffix}`;

          // Build template filter line (LTR: label first, then dots)
          const templateFilterLine = isTemplate
            ? [
                `Employé: ${templateDots}`,
                `Produit: ${templateProductName || templateDots}`,
                `Période: ${templateDots}`,
              ].join('  |  ')
            : filterCriteria;

          return (
            <section
              key={`${page.productName || 'all'}-${pageIndex}`}
              className="print-page"
              data-pdf-section={page.productName || 'all-products'}
              style={{ pageBreakBefore: pageIndex > 0 ? 'always' : 'auto' }}
            >
              <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, opacity: 0.2, pointerEvents: 'none' }}>
                <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
              </div>

              <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1, marginBottom: isTemplate ? '4px' : '10px', paddingBottom: isTemplate ? '4px' : '8px' }}>
                <div className="print-logo" style={isTemplate ? { width: '55px' } : undefined}><img src={logoImage} alt="Laser Food" /></div>
                <div className="print-title-section" style={isTemplate ? { padding: '0 10px' } : undefined}>
                  <h1 style={{ fontSize: isTemplate ? '12pt' : (page.productName ? '14pt' : '18pt'), marginBottom: isTemplate ? '2px' : '8px' }}>{pageTitle}</h1>
                  <p style={{ fontSize: isTemplate ? '8pt' : '10pt', fontWeight: 600, marginTop: '2px' }} dir="ltr">{templateFilterLine}</p>
                  {!isTemplate && (
                    <p style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>Date d'impression: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                  )}
                </div>
                <div className="print-logo" style={isTemplate ? { width: '55px' } : undefined}><img src={logoImage} alt="Laser Food" /></div>
              </div>

              <table className="word-table" dir="ltr" style={{ position: 'relative', zIndex: 1, marginTop: isTemplate ? '2px' : '5px' }}>
                <thead>
                  <tr>
                    {columns.map(col => {
                      const cfg = COLUMN_CONFIG[col];
                      return (
                        <th key={col} style={{ ...(cfg.width ? { width: cfg.width } : {}), ...(isTemplate ? { padding: '3px 4px', fontSize: '9pt' } : {}) }}>
                          {cfg.header}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {!isTemplate && page.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {columns.map(col => {
                        const cfg = COLUMN_CONFIG[col];
                        return (
                          <td key={col} className={cfg.className || ''}>
                            {getCellValue(row, col, page.rowOffset + rowIndex + 1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Empty rows: template shows all ROWS_PER_PAGE, normal fills remaining */}
                  {Array.from({ length: isTemplate ? ROWS_PER_PAGE : emptyRowsCount }).map((_, i) => (
                    <tr key={`empty-${i}`} style={isTemplate ? { height: '20px' } : undefined}>
                      {columns.map((col, j) => (
                        <td key={j} style={isTemplate ? { padding: '2px 4px' } : undefined}>
                          {isTemplate && col === 'number' ? (page.rowOffset + i + 1) : '\u00A0'}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {page.showTotals && (
                    <tr className="totals-row">
                      {isTemplate ? (
                        <td colSpan={columns.length} className="totals-label">Total</td>
                      ) : (
                        buildTotalsRow(page.totals)
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          );
        })}
        {(printSummary || summaryOnly) && summaryContent}
      </div>
    );

    if (!container) return null;
    return createPortal(content, container);
  }
);

GiftsPrintView.displayName = 'GiftsPrintView';

export default GiftsPrintView;
