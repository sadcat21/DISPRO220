import React from 'react';
import { Button } from '@/components/ui/button';
import { Receipt, FileText, Banknote, Building2, Stamp } from 'lucide-react';
import { InvoicePaymentMethod, INVOICE_PAYMENT_METHODS } from '@/types/stamp';

interface InvoicePaymentMethodSelectProps {
  value: InvoicePaymentMethod | null;
  onChange: (value: InvoicePaymentMethod) => void;
  disabled?: boolean;
}

const METHOD_ICONS: Record<InvoicePaymentMethod, React.ReactNode> = {
  receipt: <FileText className="w-3.5 h-3.5" />,
  check: <Receipt className="w-3.5 h-3.5" />,
  cash: <Banknote className="w-3.5 h-3.5" />,
  transfer: <Building2 className="w-3.5 h-3.5" />,
};

const InvoicePaymentMethodSelect: React.FC<InvoicePaymentMethodSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const methods = Object.entries(INVOICE_PAYMENT_METHODS) as [InvoicePaymentMethod, typeof INVOICE_PAYMENT_METHODS[InvoicePaymentMethod]][];

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {methods.map(([methodKey, method]) => (
        <Button
          key={methodKey}
          type="button"
          variant={value === methodKey ? 'default' : 'outline'}
          size="sm"
          className="h-8 flex items-center gap-1 text-xs"
          disabled={disabled}
          onClick={() => onChange(methodKey)}
        >
          {METHOD_ICONS[methodKey]}
          {method.label}
          {method.hasStamp && <Stamp className="w-3 h-3 text-warning" />}
        </Button>
      ))}
    </div>
  );
};

export default InvoicePaymentMethodSelect;
