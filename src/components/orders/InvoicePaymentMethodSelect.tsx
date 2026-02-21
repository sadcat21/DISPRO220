import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Receipt, FileText, Banknote, Building2, Stamp } from 'lucide-react';
import { InvoicePaymentMethod, INVOICE_PAYMENT_METHODS } from '@/types/stamp';
import { cn } from '@/lib/utils';

interface InvoicePaymentMethodSelectProps {
  value: InvoicePaymentMethod | null;
  onChange: (value: InvoicePaymentMethod) => void;
  disabled?: boolean;
}

const METHOD_ICONS: Record<InvoicePaymentMethod, React.ReactNode> = {
  receipt: <FileText className="w-4 h-4" />,
  check: <Receipt className="w-4 h-4" />,
  cash: <Banknote className="w-4 h-4" />,
  transfer: <Building2 className="w-4 h-4" />,
};

const InvoicePaymentMethodSelect: React.FC<InvoicePaymentMethodSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const methods = Object.entries(INVOICE_PAYMENT_METHODS) as [InvoicePaymentMethod, typeof INVOICE_PAYMENT_METHODS[InvoicePaymentMethod]][];

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">طريقة الدفع</Label>
      <RadioGroup
        value={value || ''}
        onValueChange={(val) => onChange(val as InvoicePaymentMethod)}
        disabled={disabled}
        className="grid grid-cols-2 gap-2"
      >
        {methods.map(([methodKey, method]) => (
          <Label
            key={methodKey}
            htmlFor={`method-${methodKey}`}
            className={cn(
              "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all",
              value === methodKey
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <RadioGroupItem value={methodKey} id={`method-${methodKey}`} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {METHOD_ICONS[methodKey]}
                <span className="font-medium text-sm">{method.label}</span>
                {method.hasStamp && (
                  <Stamp className="w-3 h-3 text-warning" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {method.description}
              </p>
            </div>
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
};

export default InvoicePaymentMethodSelect;
