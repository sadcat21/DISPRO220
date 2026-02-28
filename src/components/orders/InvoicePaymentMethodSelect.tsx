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
  receipt: { active: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 ring-2 ring-blue-400', inactive: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' },
  check: { active: 'bg-red-600 hover:bg-red-700 text-white border-red-600 ring-2 ring-red-400', inactive: 'bg-red-600 hover:bg-red-700 text-white border-red-600' },
  cash: { active: 'bg-green-600 hover:bg-green-700 text-white border-green-600 ring-2 ring-green-400', inactive: 'bg-green-600 hover:bg-green-700 text-white border-green-600' },
  transfer: { active: 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600 ring-2 ring-orange-400', inactive: 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600' },
};

const InvoicePaymentMethodSelect: React.FC<InvoicePaymentMethodSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const methods = Object.entries(INVOICE_PAYMENT_METHODS) as [InvoicePaymentMethod, typeof INVOICE_PAYMENT_METHODS[InvoicePaymentMethod]][];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {methods.map(([methodKey, method]) => (
          <Button
            key={methodKey}
            type="button"
            variant={value === methodKey ? 'default' : 'outline'}
            size="default"
            className={`h-10 flex items-center gap-1.5 text-sm font-bold transition-opacity ${value === methodKey ? METHOD_COLORS[methodKey].active : METHOD_COLORS[methodKey].inactive} ${value !== null && value !== methodKey ? 'opacity-50' : ''}`}
            disabled={disabled}
            onClick={() => onChange(methodKey)}
          >
            {METHOD_ICONS[methodKey]}
            {method.label}
            {method.hasStamp && <Stamp className="w-3 h-3 text-warning" />}
          </Button>
        ))}
      </div>
      {value === 'cash' && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg p-2.5 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <Stamp className="w-4 h-4 shrink-0" />
          <span className="font-semibold">تنبيه: سيتم احتساب سعر الطابع الجبائي (Timbre) على هذه الطلبية.</span>
        </div>
      )}
    </div>
  );
};

export default InvoicePaymentMethodSelect;
