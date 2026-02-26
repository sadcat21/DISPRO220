import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, Upload, ClipboardPaste, X, RefreshCw, Brain, ScanText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Tesseract from 'tesseract.js';

interface ExtractedData {
  amount?: string;
  invoice_number?: string;
  invoice_date?: string;
  customer_name?: string;
  check_number?: string;
  check_bank?: string;
  check_date?: string;
  receipt_number?: string;
  transfer_reference?: string;
  raw_text?: string;
  validation_warnings?: string[];
}

interface InvoiceOCRScannerProps {
  onDataExtracted: (data: ExtractedData) => void;
  paymentMethod: string;
}

const InvoiceOCRScanner = ({ onDataExtracted, paymentMethod }: InvoiceOCRScannerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [lastImageSource, setLastImageSource] = useState<File | Blob | string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  // --- AI-based analysis ---
  const analyzeWithAI = useCallback(async (base64Data: string) => {
    const { data, error } = await supabase.functions.invoke('analyze-invoice', {
      body: { image_base64: base64Data, payment_method: paymentMethod }
    });
    if (error) throw error;
    if (data?.success && data?.data) {
      const extracted: ExtractedData = data.data;
      if (extracted.amount || extracted.invoice_number || extracted.customer_name || extracted.check_number || extracted.invoice_date) {
        onDataExtracted(extracted);
        toast.success('تم استخراج البيانات بالذكاء الاصطناعي');
        // Show validation warnings for checks
        if (extracted.validation_warnings && extracted.validation_warnings.length > 0) {
          extracted.validation_warnings.forEach((warning: string) => {
            toast.warning(warning, { duration: 8000 });
          });
        }
      } else {
        toast.warning('لم يتم العثور على بيانات واضحة، حاول صورة أوضح');
        onDataExtracted({ raw_text: data.raw_text || '' });
      }
    } else {
      toast.warning('لم يتم العثور على بيانات واضحة');
      onDataExtracted({ raw_text: data?.raw_text || '' });
    }
  }, [paymentMethod, onDataExtracted]);

  // --- Free OCR using Tesseract.js ---
  const analyzeWithOCR = useCallback(async (imageSource: File | Blob | string) => {
    let imageSrc: string;
    if (typeof imageSource === 'string') {
      imageSrc = imageSource;
    } else {
      imageSrc = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.readAsDataURL(imageSource);
      });
    }

    const result = await Tesseract.recognize(imageSrc, 'ara+fra+eng', {
      logger: () => {},
    });
    const text = result.data.text;

    if (!text || text.trim().length < 5) {
      toast.warning('لم يتم التعرف على نص واضح في الصورة');
      onDataExtracted({ raw_text: text || '' });
      return;
    }

    // Try to extract structured data from OCR text
    const extracted: ExtractedData = { raw_text: text };
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // --- Extract amount ---
    // Look for labeled amounts first
    const amountPatterns = [
      /(?:المبلغ|الإجمالي|المجموع|الكلي|Net|Total|Montant|TTC|HT)[^\d]*([\d\s.,]+)/i,
      /(?:DA|د\.ج|دج|DZD)[^\d]*([\d\s.,]+)/i,
      /([\d\s.,]+)\s*(?:DA|د\.ج|دج|DZD)/i,
    ];
    for (const pat of amountPatterns) {
      const m = text.match(pat);
      if (m) {
        const cleaned = m[1].replace(/[\s.]/g, '').replace(',', '.');
        if (cleaned && !isNaN(Number(cleaned)) && Number(cleaned) > 0) {
          extracted.amount = String(Math.round(Number(cleaned)));
          break;
        }
      }
    }
    // Fallback: find the largest number in text as likely amount
    if (!extracted.amount) {
      const allNumbers = text.match(/[\d]{3,}[.,]?\d*/g);
      if (allNumbers) {
        const nums = allNumbers.map(n => Number(n.replace(/[.,]/g, ''))).filter(n => n > 0);
        if (nums.length) extracted.amount = String(Math.max(...nums));
      }
    }

    // --- Extract invoice number ---
    const invoicePatterns = [
      /(?:فاتورة|رقم الفاتورة|Facture|Fact|FC|FA|BL|N°|No|Num)[^\w]*([\w\-\/\.]+\d[\w\-\/\.]*)/i,
      /(?:N°|#)\s*([\w\-\/]+)/i,
      /(FC[\-\/]?\d[\w\-\/]*)/i,
      /(FA[\-\/]?\d[\w\-\/]*)/i,
      /(BL[\-\/]?\d[\w\-\/]*)/i,
    ];
    for (const pat of invoicePatterns) {
      const m = text.match(pat);
      if (m) {
        extracted.invoice_number = m[1].trim();
        break;
      }
    }

    // --- Extract customer name ---
    // Look for labeled customer name
    const customerPatterns = [
      /(?:العميل|الزبون|Client|Destinataire|Doit)[:\s]+(.+)/i,
      /(?:السيد|M\.|Mr\.|Mme)[:\s]+(.+)/i,
    ];
    for (const pat of customerPatterns) {
      const m = text.match(pat);
      if (m) {
        const name = m[1].trim().split(/\s{3,}/)[0].substring(0, 60);
        if (name.length > 1) {
          extracted.customer_name = name;
          break;
        }
      }
    }

    // --- Extract dates (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY) ---
    const dateMatches = text.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g);
    const dates: string[] = [];
    for (const dm of dateMatches) {
      const [, p1, p2, p3] = dm;
      let year = p3.length === 2 ? '20' + p3 : p3;
      // Detect if format is YYYY-MM-DD already
      if (Number(p1) > 31) {
        year = p1.length === 2 ? '20' + p1 : p1;
        dates.push(`${year}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`);
      } else {
        dates.push(`${year}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`);
      }
    }
    if (dates.length > 0) extracted.invoice_date = dates[0];
    if (dates.length > 1 && paymentMethod === 'check') extracted.check_date = dates[1];

    // --- Check-specific fields ---
    if (paymentMethod === 'check') {
      const checkNumMatch = text.match(/(?:شيك|Chèque|Cheque|CHQ|N°)[^\d]*([\d]{4,})/i);
      if (checkNumMatch) extracted.check_number = checkNumMatch[1];

      const bankMatch = text.match(/(?:بنك|البنك|Bank|Banque|BNA|CPA|BDL|BEA|BADR|SGA|ABC|AGB|CNEP|TRUST)[^\n]*/i);
      if (bankMatch) {
        const bankName = bankMatch[0].trim().substring(0, 40);
        if (bankName.length > 1) extracted.check_bank = bankName;
      }
    }

    // --- Receipt/Transfer fields ---
    if (paymentMethod === 'bank_receipt') {
      const receiptMatch = text.match(/(?:وصل|Reçu|Récépissé|Bordereau)[^\d]*([\w\d\-\/]+)/i);
      if (receiptMatch) extracted.receipt_number = receiptMatch[1];
    }
    if (paymentMethod === 'bank_transfer') {
      const transferMatch = text.match(/(?:تحويل|Virement|Réf|Ref|مرجع)[^\w]*([\w\d\-\/]+)/i);
      if (transferMatch) extracted.transfer_reference = transferMatch[1];
    }

    const hasData = extracted.amount || extracted.invoice_number || extracted.customer_name || extracted.invoice_date;
    if (hasData) {
      onDataExtracted(extracted);
      toast.success('تم استخراج البيانات بـ OCR المجاني');
    } else {
      onDataExtracted({ raw_text: text });
      toast.warning('لم يتم استخراج بيانات واضحة، جرب الذكاء الاصطناعي للدقة');
    }
  }, [onDataExtracted]);

  // --- Process image (shared logic) ---
  const processImage = useCallback(async (imageSource: File | Blob | string, method?: boolean) => {
    const shouldUseAI = method !== undefined ? method : useAI;
    setLastImageSource(imageSource);

    // Show preview
    let base64Data: string;
    if (typeof imageSource === 'string') {
      setPreview(imageSource);
      base64Data = imageSource.replace(/^data:image\/[^;]+;base64,/, '');
    } else {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.readAsDataURL(imageSource);
      });
      setPreview(dataUrl);
      base64Data = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
    }

    setIsProcessing(true);
    try {
      if (shouldUseAI) {
        await analyzeWithAI(base64Data);
      } else {
        await analyzeWithOCR(imageSource);
      }
    } catch (err) {
      console.error('OCR/AI Error:', err);
      toast.error('فشل في قراءة الصورة');
    } finally {
      setIsProcessing(false);
    }
  }, [useAI, analyzeWithAI, analyzeWithOCR]);

  // --- Re-analyze ---
  const handleReanalyze = useCallback(() => {
    if (!lastImageSource) {
      toast.info('لا توجد صورة لإعادة تحليلها');
      return;
    }
    processImage(lastImageSource);
  }, [lastImageSource, processImage]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleOpenLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        toast.error('تم رفض إذن الكاميرا، تحقق من إعدادات المتصفح');
      } else {
        cameraInputRef.current?.click();
      }
    }
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    stopCamera();
    canvas.toBlob(async (blob) => {
      if (blob) await processImage(blob);
    }, 'image/jpeg', 0.9);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) { await processImage(file); break; }
      }
    }
  }, [processImage]);

  const handlePasteButton = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await processImage(blob);
          return;
        }
      }
      toast.info('لا توجد صورة في الحافظة');
    } catch {
      toast.error('لا يمكن الوصول للحافظة، جرب لصق (Ctrl+V) في هذا المكان');
    }
  };

  useEffect(() => {
    const el = pasteAreaRef.current;
    if (el) {
      el.addEventListener('paste', handlePaste as EventListener);
      return () => el.removeEventListener('paste', handlePaste as EventListener);
    }
  }, [handlePaste]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, []);

  return (
    <div className="space-y-2" ref={pasteAreaRef} tabIndex={0}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />

      {/* AI vs OCR Switch */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border">
        <div className="flex items-center gap-2">
          {useAI ? <Brain className="w-4 h-4 text-primary" /> : <ScanText className="w-4 h-4 text-muted-foreground" />}
          <Label className="text-xs cursor-pointer" htmlFor="analysis-mode">
            {useAI ? 'ذكاء اصطناعي (أدق)' : 'OCR مجاني (أسرع)'}
          </Label>
        </div>
        <Switch
          id="analysis-mode"
          checked={useAI}
          onCheckedChange={setUseAI}
        />
      </div>

      {showCamera && (
        <div className="relative rounded-lg overflow-hidden border bg-black">
          <video ref={videoRef} className="w-full h-48 object-cover" autoPlay playsInline muted />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            <Button size="sm" onClick={handleCaptureFrame} className="gap-1">
              <Camera className="w-4 h-4" /> التقاط
            </Button>
            <Button size="sm" variant="destructive" onClick={stopCamera}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {!showCamera && !isProcessing && (
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> رفع صورة
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={handleOpenLiveCamera}>
            <Camera className="w-3.5 h-3.5" /> كاميرا
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={handlePasteButton}>
            <ClipboardPaste className="w-3.5 h-3.5" /> لصق
          </Button>
        </div>
      )}

      {isProcessing && (
        <Button type="button" variant="outline" className="w-full gap-2" disabled>
          <Loader2 className="w-4 h-4 animate-spin" />
          {useAI ? 'جاري تحليل الصورة بالذكاء الاصطناعي...' : 'جاري تحليل الصورة بـ OCR...'}
        </Button>
      )}

      {preview && !showCamera && (
        <div className="relative rounded-lg overflow-hidden border max-h-32">
          <img src={preview} alt="معاينة" className="w-full h-32 object-cover" />
          {isProcessing && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* Re-analyze button */}
      {preview && !isProcessing && !showCamera && (
        <Button type="button" variant="secondary" size="sm" className="w-full gap-1.5 text-xs" onClick={handleReanalyze}>
          <RefreshCw className="w-3.5 h-3.5" /> إعادة تحليل الصورة
        </Button>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        يمكنك أيضاً لصق صورة مباشرة (Ctrl+V) في هذا المكان
      </p>
    </div>
  );
};

export default InvoiceOCRScanner;
