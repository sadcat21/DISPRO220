import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateDocCollection } from '@/hooks/useDocumentCollections';
import { toast } from 'sonner';

interface DocCollectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  customerName: string;
  documentType: string;
  totalAmount: number;
}

const getDocLabel = (type: string) => {
  switch (type) {
    case 'check': return 'Chèque';
    case 'receipt': return 'Versement';
    case 'transfer': return 'Virement';
    default: return type;
  }
};

const DocCollectDialog: React.FC<DocCollectDialogProps> = ({
  open, onOpenChange, orderId, customerName, documentType, totalAmount,
}) => {
  const { workerId } = useAuth();
  const createCollection = useCreateDocCollection();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const handleSubmit = async () => {
    if (!workerId) return;

    try {
      await createCollection.mutateAsync({
        orderId,
        workerId,
        action: 'collected',
        notes: notes || `تم تحصيل ${getDocLabel(documentType)}`,
      });
      toast.success('تم تسجيل تحصيل المستند بنجاح');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3" dir="rtl">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck className="w-4 h-4 shrink-0" />
            <span className="truncate">تحصيل مستند - {customerName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3 text-center space-y-1">
            <p className="text-xs text-muted-foreground">نوع المستند</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">{getDocLabel(documentType)}</p>
            <p className="text-sm font-bold">{totalAmount.toLocaleString()} DA</p>
          </div>

          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="ملاحظات..."
            className="text-sm resize-none"
          />

          <Button
            className="w-full h-9"
            onClick={handleSubmit}
            disabled={createCollection.isPending}
          >
            {createCollection.isPending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            تأكيد التحصيل
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocCollectDialog;
