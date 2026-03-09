import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCustomerTypes, getCustomerTypeColor, getCustomerTypeLabel, CustomerTypeEntry } from '@/hooks/useCustomerTypes';
import { useLanguage } from '@/contexts/LanguageContext';

export interface CustomerLabelData {
  name?: string | null;
  store_name?: string | null;
  customer_type?: string | null;
  sector_name?: string | null;
}

interface CustomerLabelProps {
  customer: CustomerLabelData;
  /** compact = single line badges only, full = two lines */
  compact?: boolean;
  className?: string;
  /** Override customer types to avoid extra queries when parent already has them */
  customerTypes?: CustomerTypeEntry[];
  /** Hide badges when space is very tight */
  hideBadges?: boolean;
}

/**
 * Unified component to display customer store name + name + sector badge + type badge.
 * Use `compact` for dropdowns/lists (single line), default for cards/dialogs (two lines).
 */
const CustomerLabel: React.FC<CustomerLabelProps> = ({
  customer,
  compact = false,
  className,
  customerTypes: externalTypes,
  hideBadges = false,
}) => {
  const { language } = useLanguage();
  const { customerTypes: hookTypes } = useCustomerTypes();
  const types = externalTypes || hookTypes;

  const displayName = customer.store_name || customer.name || '—';
  const secondaryName = customer.store_name ? customer.name : null;

  // Customer type badge
  const typeEntry = types.find(t => t.ar === customer.customer_type);
  const typeLabel = typeEntry
    ? getCustomerTypeLabel(types, customer.customer_type, language)
    : customer.customer_type;
  const typeColor = typeEntry
    ? getCustomerTypeColor(typeEntry.short, 0, typeEntry)
    : null;

  const badges = !hideBadges && (
    <>
      {customer.sector_name && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-primary/30 text-primary"
        >
          {customer.sector_name}
        </Badge>
      )}
      {customer.customer_type && typeLabel && (
        <Badge
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-0"
          style={typeColor ? { backgroundColor: typeColor.bg, color: typeColor.text } : undefined}
        >
          {typeLabel}
        </Badge>
      )}
    </>
  );

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1 min-w-0', className)}>
        <span className="font-bold text-sm truncate">{displayName}</span>
        {secondaryName && (
          <span className="text-xs text-muted-foreground truncate">— {secondaryName}</span>
        )}
        {badges}
      </span>
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="font-bold text-sm truncate">{displayName}</span>
        {badges}
      </div>
      {secondaryName && (
        <p className="text-xs text-muted-foreground truncate mt-0.5">{secondaryName}</p>
      )}
    </div>
  );
};

export default CustomerLabel;
