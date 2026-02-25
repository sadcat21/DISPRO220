import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Share2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReceiptViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptUrls: string[];
  title?: string;
}

const ReceiptViewerDialog: React.FC<ReceiptViewerDialogProps> = ({
  open,
  onOpenChange,
  receiptUrls,
  title,
}) => {
  const { t, dir } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentUrl = receiptUrls[currentIndex] || '';

  const handleDownload = async () => {
    try {
      const response = await fetch(currentUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${currentIndex + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(currentUrl, '_blank');
    }
  };

  const handleShare = async (platform: 'whatsapp' | 'facebook' | 'telegram' | 'native') => {
    const shareText = title || t('expenses.receipt_image');
    
    if (platform === 'native' && navigator.share) {
      try {
        await navigator.share({ title: shareText, url: currentUrl });
        return;
      } catch { /* fallback */ }
    }

    const encodedUrl = encodeURIComponent(currentUrl);
    const encodedText = encodeURIComponent(shareText);

    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    };

    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'noopener,noreferrer');
    }
  };

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, receiptUrls.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  React.useEffect(() => {
    if (open) setCurrentIndex(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0" dir={dir}>
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">
            {t('expenses.view_receipt')}
            {receiptUrls.length > 1 && ` (${currentIndex + 1}/${receiptUrls.length})`}
          </DialogTitle>
        </DialogHeader>

        {/* Image */}
        <div className="flex-1 overflow-auto px-4 flex items-center justify-center min-h-[200px] max-h-[50vh]">
          <img
            src={currentUrl}
            alt="Receipt"
            className="max-w-full max-h-[50vh] object-contain rounded-lg"
          />
        </div>

        {/* Navigation */}
        {receiptUrls.length > 1 && (
          <div className="flex items-center justify-center gap-3 py-2">
            <Button variant="outline" size="icon" onClick={goPrev} disabled={currentIndex === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{currentIndex + 1} / {receiptUrls.length}</span>
            <Button variant="outline" size="icon" onClick={goNext} disabled={currentIndex === receiptUrls.length - 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 pt-2 space-y-3 border-t">
          <Button variant="outline" className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 me-2" />
            {t('expenses.download_receipt') || 'تحميل'}
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
              onClick={() => handleShare('whatsapp')}
            >
              <svg className="w-4 h-4 me-1" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              واتساب
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => handleShare('facebook')}
            >
              <svg className="w-4 h-4 me-1" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              فيسبوك
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-sky-500 border-sky-200 hover:bg-sky-50"
              onClick={() => handleShare('telegram')}
            >
              <svg className="w-4 h-4 me-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              تيليجرام
            </Button>
          </div>

          {navigator.share && (
            <Button variant="secondary" className="w-full" onClick={() => handleShare('native')}>
              <Share2 className="w-4 h-4 me-2" />
              {t('expenses.share') || 'مشاركة أخرى'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptViewerDialog;
