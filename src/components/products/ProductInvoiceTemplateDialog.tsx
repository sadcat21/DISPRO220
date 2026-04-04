import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { Product } from '@/types/database';

const VAT_RATE = 0.19;
const COMPANY_NAME = 'SARL LASER FOOD';
const COMPANY_TAGLINE = 'Commerce de gros lié à l’alimentation humaine';

type InvoiceLine = {
  id: string;
  productId: string;
  quantity: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
};

const formatMoney = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getNetPriceBeforeVat = (grossPrice: number) => (grossPrice > 0 ? grossPrice / (1 + VAT_RATE) : 0);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getPricingUnitLabel = (product: Product) => {
  if (product.pricing_unit === 'kg') return 'kg';
  if (product.pricing_unit === 'unit') return 'pcs';
  return 'u';
};

const getInvoiceGrossPrice = (product: Product) =>
  Number(product.price_invoice || product.price_gros || product.price_retail || product.price_super_gros || 0);

const invoiceHeaders = ['N°', 'Code', 'Désignation', 'Qté', 'Unité', 'PU HT', 'Montant HT', 'TVA (%)'];

const createLine = (productId = ''): InvoiceLine => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  productId,
  quantity: 1,
});

const ProductInvoiceTemplateDialog: React.FC<Props> = ({ open, onOpenChange, products }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const invoiceProducts = useMemo(
    () => products.filter((product) => product.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const [invoiceNumber, setInvoiceNumber] = useState('FC0038/2026');
  const [invoiceDate, setInvoiceDate] = useState('2026-04-01');
  const [cityLine, setCityLine] = useState('Oran, le 01/04/2026');
  const [depot, setDepot] = useState('Dépot: Dépot Mostaganem');
  const [clientName, setClientName] = useState('BERDADI BENATIA HOUARI');
  const [clientAddress, setClientAddress] = useState('Local N°2 cité124 rue Bahar Boualem lot17 Sec N°22 Touahria Mostaganem');
  const [clientRc, setClientRc] = useState('RC : 19A3962200-03/27    NIF : 827719010791920701    AI : 27310107146');
  const [clientActivity, setClientActivity] = useState('Activité : COMMERCE DE DETAIL DE L’ALIMENTATION GENERALE (EPICERIE)');
  const [paymentMethod, setPaymentMethod] = useState('Mode de Payement : Versement');
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  useEffect(() => {
    if (!open) return;
    const defaults = invoiceProducts
      .filter((product) => getInvoiceGrossPrice(product) > 0)
      .slice(0, 5)
      .map((product) => createLine(product.id));
    setLines(defaults.length ? defaults : [createLine(invoiceProducts[0]?.id || '')]);
  }, [open, invoiceProducts]);

  const lineRows = useMemo(() => {
    return lines
      .map((line, index) => {
        const product = invoiceProducts.find((item) => item.id === line.productId);
        if (!product) return null;
        const grossUnitPrice = getInvoiceGrossPrice(product);
        const netUnitPrice = getNetPriceBeforeVat(grossUnitPrice);
        const quantity = Number(line.quantity || 0);
        const totalHt = netUnitPrice * quantity;
        const vatAmount = totalHt * VAT_RATE;
        const totalNet = totalHt + vatAmount;
        return {
          ...line,
          index: index + 1,
          product,
          quantity,
          netUnitPrice,
          totalHt,
          vatAmount,
          totalNet,
          unitLabel: getPricingUnitLabel(product),
        };
      })
      .filter(Boolean) as Array<InvoiceLine & {
      index: number;
      product: Product;
      netUnitPrice: number;
      totalHt: number;
      vatAmount: number;
      totalNet: number;
      unitLabel: string;
    }>;
  }, [lines, invoiceProducts]);

  const totals = useMemo(() => {
    const totalHt = lineRows.reduce((sum, row) => sum + row.totalHt, 0);
    const totalVat = lineRows.reduce((sum, row) => sum + row.vatAmount, 0);
    const totalNet = totalHt + totalVat;
    return { totalHt, totalVat, totalNet };
  }, [lineRows]);

  const addLine = () => {
    setLines((current) => [...current, createLine(invoiceProducts[0]?.id || '')]);
  };

  const updateLine = (id: string, patch: Partial<InvoiceLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current));
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1100,height=900');
    if (!win) return;

    const rowsHtml = lineRows
      .map(
        (row) => `
          <tr>
            <td>${row.index}</td>
            <td dir="ltr">${escapeHtml(row.product.product_code || '-')}</td>
            <td>${escapeHtml(row.product.name)}</td>
            <td dir="ltr">${row.quantity}</td>
            <td>${escapeHtml(row.unitLabel)}</td>
            <td dir="ltr">${formatMoney(row.netUnitPrice)}</td>
            <td dir="ltr">${formatMoney(row.totalHt)}</td>
            <td dir="ltr">19</td>
          </tr>
        `,
      )
      .join('');

    const blankRowsHtml = Array.from({ length: Math.max(0, 14 - lineRows.length) })
      .map(
        () => `
          <tr>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
        `,
      )
      .join('');

    win.document.write(`
      <html lang="fr">
        <head>
          <title>Facture</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; font-family: "Times New Roman", Georgia, serif; background: #fff; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .invoice-root { width: 100%; max-width: 980px; margin: 0 auto; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #222; padding: 5px 6px; font-size: 12px; vertical-align: top; }
            th { background: #f4f4f4; }
            .top-row { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
            .client-box { border: 2px solid #444; border-radius: 6px; padding: 10px 12px; min-width: 360px; }
            .brand { font-size: 26px; font-style: italic; font-weight: 700; }
            .tagline { color: #304bbf; font-style: italic; font-weight: 600; margin-top: 2px; }
            .meta { font-size: 12px; line-height: 1.55; }
            .footer-grid { display:grid; grid-template-columns: 1fr 260px; gap: 20px; margin-top: 16px; }
            .totals-box { border: 2px solid #444; padding: 8px 12px; }
            .totals-box .row { display:flex; justify-content:space-between; margin: 8px 0; font-size: 13px; }
            .muted { color:#555; }
            .invoice-table td:nth-child(1) { width: 32px; text-align: center; }
            .invoice-table td:nth-child(2) { width: 52px; text-align: center; }
            .invoice-table td:nth-child(4) { width: 54px; text-align: center; }
            .invoice-table td:nth-child(5) { width: 58px; text-align: center; }
            .invoice-table td:nth-child(6),
            .invoice-table td:nth-child(7),
            .invoice-table td:nth-child(8) { width: 88px; text-align: right; }
            .invoice-table tbody tr { height: 24px; }
            .ltr { direction: ltr; unicode-bidi: embed; white-space: nowrap; }
            @media print {
              body { padding: 0; }
              .invoice-root { max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-root">
            <div class="top-row">
              <div>
                <div class="brand">${escapeHtml(COMPANY_NAME)}</div>
                <div class="tagline">${escapeHtml(COMPANY_TAGLINE)}</div>
                <div class="meta" style="margin-top:12px;">
                  <div>Tel LOT N° 90 LOTIS 440 BELGADI Bir El Djir Oran</div>
                  <div>Tel : Mobile</div>
                  <div>RC : 19811230057-00731 &nbsp;&nbsp; NIF : 001931130205729 &nbsp;&nbsp; AI : 3103404924</div>
                  <div style="margin-top:6px;">Compte bancaire : BNA &nbsp; R.I.B : 00100957300000149786 &nbsp; NIS : 001931300506846</div>
                </div>
                <div style="margin-top:18px; font-size:13px;">
                  <div><strong>Facture N° :</strong> <span class="ltr">${escapeHtml(invoiceNumber)}</span></div>
                  <div style="margin-top:6px;">${escapeHtml(cityLine)}</div>
                  <div style="margin-top:14px;">${escapeHtml(depot)}</div>
                </div>
              </div>
              <div class="client-box">
                <div style="font-size:13px; font-weight:700;">Client: ${escapeHtml(clientName)}</div>
                <div>${escapeHtml(clientAddress)}</div>
                <div>${escapeHtml(clientRc)}</div>
                <div style="margin-top:10px;">${escapeHtml(clientActivity)}</div>
                <div style="font-weight:700;">${escapeHtml(paymentMethod)}</div>
              </div>
            </div>

            <table class="invoice-table" style="margin-top:16px;">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Qté</th>
                  <th>Unité</th>
                  <th>PU HT</th>
                  <th>Montant HT</th>
                  <th>TVA (%)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                ${blankRowsHtml}
              </tbody>
            </table>

            <div class="footer-grid">
              <div style="font-size:11px; line-height:1.7;">
                <div style="margin-bottom:8px; font-weight:700;">Arrêter la présente facture à la somme de :</div>
                <div class="ltr">${formatMoney(totals.totalNet)} DA</div>
                <div style="margin-top:12px; color:#444;">PAIEMENT A TERME</div>
              </div>
              <div class="totals-box">
                <div class="row"><span>Total H.T</span><span class="ltr"><strong>${formatMoney(totals.totalHt)} DA</strong></span></div>
                <div class="row"><span>Net H.T</span><span class="ltr"><strong>${formatMoney(totals.totalHt)} DA</strong></span></div>
                <div class="row"><span>Total T.V.A</span><span class="ltr"><strong>${formatMoney(totals.totalVat)} DA</strong></span></div>
                <div class="row" style="border-top:1px solid #444; padding-top:8px; margin-top:10px; font-size:14px;">
                  <span><strong>Total Net</strong></span>
                  <span class="ltr"><strong>${formatMoney(totals.totalNet)} DA</strong></span>
                </div>
              </div>
            </div>

            <div style="margin-top:18px; font-size:10px; color:#666;">Page 1/1</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-[96vw] w-[1200px] max-h-[95vh] overflow-hidden p-0">
        <div className="border-b px-5 py-4">
          <DialogHeader className="mb-3">
            <DialogTitle className="text-xl">إعدادات طباعة الفاتورة</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={addLine} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة سطر
            </Button>
            <Button type="button" variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
          </div>
        </div>

        <div className="grid h-[78vh] grid-cols-1 gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
          <ScrollArea className="border-l px-5 py-4">
            <div className="space-y-5">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">بيانات الفاتورة</Label>
                <div className="space-y-2">
                  <Label>رقم الفاتورة</Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ الفاتورة</Label>
                  <Input value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} dir="ltr" className="text-left [direction:ltr]" />
                </div>
                <div className="space-y-2">
                  <Label>سطر المدينة والتاريخ</Label>
                  <Input value={cityLine} onChange={(e) => setCityLine(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>سطر المستودع</Label>
                  <Input value={depot} onChange={(e) => setDepot(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">بيانات العميل</Label>
                <div className="space-y-2">
                  <Label>العميل</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>العنوان</Label>
                  <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>RC / NIF / AI</Label>
                  <Input value={clientRc} onChange={(e) => setClientRc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>النشاط</Label>
                  <Input value={clientActivity} onChange={(e) => setClientActivity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>طريقة الدفع</Label>
                  <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">المنتجات والكميات</Label>
                {lines.map((line) => {
                  const product = invoiceProducts.find((item) => item.id === line.productId);
                  const unitPriceNet = product ? getNetPriceBeforeVat(getInvoiceGrossPrice(product)) : 0;
                  return (
                    <div key={line.id} className="space-y-2 rounded-xl border p-3">
                      <div className="space-y-2">
                        <Label>المنتج</Label>
                        <Select value={line.productId} onValueChange={(value) => updateLine(line.id, { productId: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر المنتج" />
                          </SelectTrigger>
                          <SelectContent>
                            {invoiceProducts.map((productOption) => (
                              <SelectItem key={productOption.id} value={productOption.id}>
                                {productOption.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div className="space-y-2">
                          <Label>الكمية</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value || 0) })}
                            dir="ltr"
                            className="text-left [direction:ltr]"
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="mt-7 text-destructive" onClick={() => removeLine(line.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {product && (
                        <div className="rounded-lg bg-muted/40 p-2 text-xs">
                          <div>CODE: <span dir="ltr" className="font-medium">{product.product_code || '-'}</span></div>
                          <div>الوحدة: <span className="font-medium">{getPricingUnitLabel(product)}</span></div>
                          <div>PU HT: <span dir="ltr" className="font-medium">{formatMoney(unitPriceNet)} DA</span></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          <ScrollArea className="bg-[#f7f5f1] px-6 py-5">
            <div ref={printRef} className="invoice-root mx-auto max-w-[980px] bg-white p-6 text-left text-[#111]" style={{ fontFamily: '"Times New Roman", Georgia, serif' }}>
              <div className="mb-5 flex items-start justify-between gap-5">
                <div>
                  <div className="text-[24px] font-bold italic tracking-tight">{COMPANY_NAME}</div>
                  <div className="mt-1 text-[14px] font-semibold italic text-[#3348b5]">{COMPANY_TAGLINE}</div>
                  <div className="mt-3 text-[11px] leading-5 text-[#222]">
                    <div>Tel LOT N° 90 LOTIS 440 BELGADI Bir El Djir Oran</div>
                    <div>Tel : Mobile</div>
                    <div>RC : 19811230057-00731 &nbsp;&nbsp; NIF : 001931130205729 &nbsp;&nbsp; AI : 3103404924</div>
                    <div className="mt-2">Compte bancaire : BNA &nbsp; R.I.B : 00100957300000149786 &nbsp; NIS : 001931300506846</div>
                  </div>
                  <div className="mt-5 text-[13px]">
                    <div className="font-semibold">Facture N° : <span dir="ltr">{invoiceNumber}</span></div>
                    <div className="mt-2">{cityLine}</div>
                    <div className="mt-4">{depot}</div>
                  </div>
                </div>

                <div className="min-w-[365px] rounded-[6px] border-2 border-[#5a5a5a] px-4 py-3 text-[11px] leading-5">
                  <div className="text-[13px] font-bold">Client: {clientName}</div>
                  <div>{clientAddress}</div>
                  <div>{clientRc}</div>
                  <div className="mt-3">{clientActivity}</div>
                  <div className="font-semibold">{paymentMethod}</div>
                </div>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#f5f5f5]">
                    {['N°', 'Code', 'Désignation', 'Qté', 'Unité', 'PU HT', 'Montant HT', 'TVA (%)'].map((header) => (
                      <th key={header} className="border border-[#333] px-2 py-2 text-[11px] font-bold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineRows.map((row) => (
                    <tr key={row.id}>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]">{row.index}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]" dir="ltr">{row.product.product_code || '-'}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]">{row.product.name}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]" dir="ltr">{row.quantity}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]">{row.unitLabel}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]" dir="ltr">{formatMoney(row.netUnitPrice)}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]" dir="ltr">{formatMoney(row.totalHt)}</td>
                      <td className="border border-[#333] px-2 py-1.5 text-[11px]" dir="ltr">19</td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 14 - lineRows.length) }).map((_, index) => (
                    <tr key={`blank-${index}`}>
                      {Array.from({ length: 8 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="h-[30px] border border-[#333] px-2 py-1.5 text-[11px]">&nbsp;</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-5 grid grid-cols-[1fr_260px] gap-5">
                <div className="text-[11px] leading-5">
                  <div className="mb-2 font-semibold">Arrêter la présente facture à la somme de :</div>
                  <div className="text-[#333]">
                    {formatMoney(totals.totalNet)} DA
                  </div>
                  <div className="mt-3 text-[#444]">PAIEMENT A TERME</div>
                </div>
                <div className="border-2 border-[#4b4b4b] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between py-1">
                    <span>Total H.T</span>
                    <span dir="ltr" className="font-semibold">{formatMoney(totals.totalHt)} DA</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>Net H.T</span>
                    <span dir="ltr" className="font-semibold">{formatMoney(totals.totalHt)} DA</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>Total T.V.A</span>
                    <span dir="ltr" className="font-semibold">{formatMoney(totals.totalVat)} DA</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t pt-2 text-[13px] font-bold">
                    <span>Total Net</span>
                    <span dir="ltr">{formatMoney(totals.totalNet)} DA</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 text-[10px] text-[#666]">Page 1/1</div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductInvoiceTemplateDialog;
