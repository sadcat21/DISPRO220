import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, ScanLine } from 'lucide-react';
import { toast } from 'sonner';

interface ExtractedData {
  amount?: string;
  invoice_number?: string;
  check_number?: string;
  check_bank?: string;
  receipt_number?: string;
  transfer_reference?: string;
  raw_text?: string;
}

interface InvoiceOCRScannerProps {
  onDataExtracted: (data: ExtractedData) => void;
  paymentMethod: string;
}

const InvoiceOCRScanner = ({ onDataExtracted, paymentMethod }: InvoiceOCRScannerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractDataFromText = (text: string): ExtractedData => {
    const data: ExtractedData = { raw_text: text };

    // Extract amounts - look for patterns like 925,927.10 or 925927.10 or 925 927,10
    const amountPatterns = [
      /(?:المبلغ|الإجمالي|المجموع|TTC|Total|Montant|NET\s*[AÀ]\s*PAYER)[:\s]*([0-9][0-9\s,.]+[0-9])/i,
      /([0-9]{1,3}(?:[,.\s][0-9]{3})*(?:[,.][0-9]{2}))\s*(?:د\.ج|DA|DZD)/i,
      /(?:مبلغ|amount)[:\s]*([0-9][0-9\s,.]+[0-9])/i,
    ];

    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Clean amount: remove spaces, normalize separators
        let amt = match[1].replace(/\s/g, '');
        // If has comma as decimal: 925,927.10 or 925927,10
        if (amt.includes(',') && amt.includes('.')) {
          amt = amt.replace(/,/g, ''); // Remove thousand separator commas
        } else if (amt.includes(',')) {
          // Could be decimal comma (French style): 925927,10
          const parts = amt.split(',');
          if (parts[parts.length - 1].length === 2) {
            amt = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
          } else {
            amt = amt.replace(/,/g, '');
          }
        }
        data.amount = parseFloat(amt).toString();
        if (!isNaN(Number(data.amount))) break;
      }
    }

    // Extract invoice number
    const invoicePatterns = [
      /(?:فاتورة|facture|invoice|FC|N°)[:\s#]*([A-Z0-9/-]+)/i,
      /(?:رقم)[:\s]*([A-Z0-9/-]+)/i,
    ];
    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match) {
        data.invoice_number = match[1];
        break;
      }
    }

    // Extract check number
    if (paymentMethod === 'check') {
      const checkPatterns = [
        /(?:شيك|chèque|cheque|check)[:\s#]*([0-9]+)/i,
        /(?:N°|رقم)[:\s]*([0-9]{5,})/i,
      ];
      for (const pattern of checkPatterns) {
        const match = text.match(pattern);
        if (match) {
          data.check_number = match[1];
          break;
        }
      }

      // Extract bank name
      const bankPatterns = [
        /(?:بنك|banque|bank|BNA|CPA|BADR|BDL|BEA|CNEP|SGA|AGB|Gulf Bank|ABC|Trust Bank)[A-Za-z\s]*/i,
      ];
      for (const pattern of bankPatterns) {
        const match = text.match(pattern);
        if (match) {
          data.check_bank = match[0].trim();
          break;
        }
      }
    }

    // Extract receipt/transfer reference
    if (paymentMethod === 'bank_receipt') {
      const receiptMatch = text.match(/(?:وصل|reçu|receipt|bordereau)[:\s#]*([A-Z0-9/-]+)/i);
      if (receiptMatch) data.receipt_number = receiptMatch[1];
    }

    if (paymentMethod === 'bank_transfer') {
      const refMatch = text.match(/(?:مرجع|référence|reference|ref|virement)[:\s#]*([A-Z0-9/-]+)/i);
      if (refMatch) data.transfer_reference = refMatch[1];
    }

    return data;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setIsProcessing(true);
    try {
      // Dynamic import to avoid loading Tesseract.js until needed
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ara+fra', 1, {
        logger: () => {}, // Suppress logs
      });

      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      const extracted = extractDataFromText(text);

      if (extracted.amount || extracted.invoice_number || extracted.check_number) {
        onDataExtracted(extracted);
        toast.success('تم استخراج البيانات من الصورة');
      } else {
        toast.warning('لم يتم العثور على بيانات واضحة، حاول التقاط صورة أوضح');
        // Still pass raw text so user can see what was detected
        onDataExtracted({ raw_text: text });
      }
    } catch (err) {
      console.error('OCR Error:', err);
      toast.error('فشل في قراءة الصورة');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري قراءة الصورة...
          </>
        ) : (
          <>
            <ScanLine className="w-4 h-4" />
            <Camera className="w-4 h-4" />
            مسح فاتورة / شيك
          </>
        )}
      </Button>

      {preview && (
        <div className="relative rounded-lg overflow-hidden border max-h-32">
          <img src={preview} alt="معاينة" className="w-full h-32 object-cover" />
          {isProcessing && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvoiceOCRScanner;
