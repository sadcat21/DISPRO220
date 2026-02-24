import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export interface PrintColumnConfig {
  id: string;
  labelKey: string;
  visible: boolean;
}

export const DEFAULT_PRINT_COLUMNS: PrintColumnConfig[] = [
  { id: 'number', labelKey: 'print.header.number', visible: true },
  { id: 'order_id', labelKey: 'print.header.order_id', visible: false },
  { id: 'qr', labelKey: 'print.header.qr', visible: false },
  { id: 'customer', labelKey: 'print.header.customer', visible: true },
  { id: 'store_name', labelKey: 'print.header.store_name', visible: false },
  { id: 'phone', labelKey: 'print.header.phone', visible: true },
  { id: 'address', labelKey: 'print.header.address', visible: true },
  { id: 'delivery_worker', labelKey: 'print.header.delivery_worker', visible: true },
  { id: 'payment_info', labelKey: 'print.header.payment_info', visible: true },
  { id: 'products', labelKey: 'print.columns.products', visible: true },
  { id: 'total_amount', labelKey: 'print.header.total_amount', visible: true },
];

interface PrintColumnsConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: PrintColumnConfig[];
  onColumnsChange: (columns: PrintColumnConfig[]) => void;
}

const PrintColumnsConfigDialog: React.FC<PrintColumnsConfigDialogProps> = ({
  open,
  onOpenChange,
  columns,
  onColumnsChange,
}) => {
  const { t, dir } = useLanguage();
  const [localColumns, setLocalColumns] = useState<PrintColumnConfig[]>(columns);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleToggle = (id: string) => {
    setLocalColumns(prev =>
      prev.map(col => col.id === id ? { ...col, visible: !col.visible } : col)
    );
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...localColumns];
    const draggedItem = items[dragItem.current];
    items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, draggedItem);
    dragItem.current = null;
    dragOverItem.current = null;
    setLocalColumns(items);
  };

  const handleSave = () => {
    onColumnsChange(localColumns);
    onOpenChange(false);
  };

  // Sync local state when dialog opens
  React.useEffect(() => {
    if (open) setLocalColumns(columns);
  }, [open, columns]);

  const visibleCount = localColumns.filter(c => c.visible).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-sm p-4" dir={dir}>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">{t('print.columns_config')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {localColumns.map((col, index) => (
            <div
              key={col.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/60 cursor-grab active:cursor-grabbing transition-colors"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 flex items-center gap-2">
                {col.visible ? (
                  <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <Label className="text-sm cursor-pointer flex-1">{t(col.labelKey)}</Label>
              </div>
              <Switch
                checked={col.visible}
                onCheckedChange={() => handleToggle(col.id)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {t('print.visible_columns')}: {visibleCount}/{localColumns.length}
          </span>
          <Button size="sm" onClick={handleSave}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintColumnsConfigDialog;
