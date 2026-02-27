import React from 'react';
import { DollarSign, Package } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCustomerCreditSummary } from '@/hooks/useCustomerCredits';
import { useLanguage } from '@/contexts/LanguageContext';

interface CustomerCreditBadgesProps {
  customerId: string;
  compact?: boolean;
}

const CustomerCreditBadges: React.FC<CustomerCreditBadgesProps> = ({ customerId, compact = false }) => {
  const summary = useCustomerCreditSummary(customerId);
  const { t } = useLanguage();

  if (!summary.hasFinancial && !summary.hasProduct) return null;

  return (
    <TooltipProvider>
      <div className="inline-flex items-center gap-1">
        {summary.hasFinancial && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold cursor-default">
                <DollarSign className="w-3 h-3" />
                {!compact && <span>+{summary.financialTotal.toLocaleString()}</span>}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>فائض مالي: {summary.financialTotal.toLocaleString()} {t('common.currency')}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {summary.hasProduct && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-bold cursor-default">
                <Package className="w-3 h-3" />
                {!compact && <span>+{summary.productCreditsCount + summary.pendingProductCredits}</span>}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>منتجات مستحقة: {summary.productCreditsCount} معتمدة{summary.pendingProductCredits > 0 ? ` + ${summary.pendingProductCredits} قيد الانتظار` : ''}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

export default CustomerCreditBadges;
