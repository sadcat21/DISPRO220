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

const METHOD_COLORS: Record<InvoicePaymentMethod, { active: string; inactive: string }> = {
  receipt: { active: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600', inactive: 'bg-blue-100 hover:bg-blue-200 text-black border-blue-200' },
  check: { active: 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600', inactive: 'bg-purple-100 hover:bg-purple-200 text-black border-purple-200' },
  cash: { active: 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600', inactive: 'bg-amber-100 hover:bg-amber-200 text-black border-amber-200' },
  transfer: { active: 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600', inactive: 'bg-teal-100 hover:bg-teal-200 text-black border-teal-200' },
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
          className={`h-8 flex items-center gap-1 text-xs ${value === methodKey ? METHOD_COLORS[methodKey].active : METHOD_COLORS[methodKey].inactive}`}
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
