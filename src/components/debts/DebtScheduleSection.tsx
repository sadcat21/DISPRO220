import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarClock } from 'lucide-react';
import QuickDayPicker, { DAY_NAMES } from './QuickDayPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { CustomerDebtWithDetails } from '@/types/accounting';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';

interface DebtScheduleSectionProps {
  debt: CustomerDebtWithDetails;
}

const DebtScheduleSection: React.FC<DebtScheduleSectionProps> = ({ debt }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [collectionType, setCollectionType] = useState<'none' | 'daily' | 'weekly'>(
    (debt.collection_type as any) || 'none'
  );
  const [collectionAmount, setCollectionAmount] = useState(
    debt.collection_amount ? String(debt.collection_amount) : ''
  );
  const [collectionDays, setCollectionDays] = useState<string[]>(
    debt.collection_days || []
  );
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const origType = (debt.collection_type as any) || 'none';
    const origAmount = debt.collection_amount ? String(debt.collection_amount) : '';
    const origDays = debt.collection_days || [];
    
    const changed = collectionType !== origType || 
      collectionAmount !== origAmount || 
      JSON.stringify(collectionDays.sort()) !== JSON.stringify([...origDays].sort());
    setHasChanges(changed);
  }, [collectionType, collectionAmount, collectionDays, debt]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('customer_debts')
        .update({
          collection_type: collectionType,
          collection_amount: collectionAmount ? Number(collectionAmount) : null,
          collection_days: collectionType === 'weekly' ? collectionDays : null,
        } as any)
        .eq('id', debt.id);

      if (error) throw error;
      toast.success(t('debts.schedule_saved'));
      queryClient.invalidateQueries({ queryKey: ['customer-debts'] });
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remaining = Number(debt.remaining_amount);
  const amount = Number(collectionAmount) || 0;

  // Calculate estimated completion
  let estimatedInfo = '';
  if (amount > 0 && remaining > 0) {
    if (collectionType === 'daily') {
      const daysNeeded = Math.ceil(remaining / amount);
      const endDate = addDays(new Date(), daysNeeded);
      estimatedInfo = `${daysNeeded} ${t('debts.days_to_complete')} (${format(endDate, 'dd/MM/yyyy')})`;
    } else if (collectionType === 'weekly' && collectionDays.length > 0) {
      const visitsNeeded = Math.ceil(remaining / amount);
      const weeksNeeded = Math.ceil(visitsNeeded / collectionDays.length);
      const totalDays = weeksNeeded * 7;
      const endDate = addDays(new Date(), totalDays);
      estimatedInfo = `${visitsNeeded} ${t('debts.visits_to_complete')} (~${weeksNeeded} ${t('debts.weeks')}) → ${format(endDate, 'dd/MM/yyyy')}`;
    }
  }

  return (
    <div className="border-t pt-3 mt-2 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="w-4 h-4" />
        {t('debts.collection_schedule')}
      </div>

      {/* Daily switch */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">{t('debts.daily_collection')}</Label>
        <Switch
          checked={collectionType === 'daily'}
          onCheckedChange={(checked) => {
            setCollectionType(checked ? 'daily' : 'none');
            if (checked) setCollectionDays([]);
          }}
        />
      </div>

      {/* Weekly switch */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">{t('debts.weekly_collection')}</Label>
        <Switch
          checked={collectionType === 'weekly'}
          onCheckedChange={(checked) => {
            setCollectionType(checked ? 'weekly' : 'none');
          }}
        />
      </div>

      {/* Day picker for weekly */}
      {collectionType !== 'none' && (
        <div className="space-y-2">
          <Label className="text-xs">
            {collectionType === 'daily' ? t('debts.daily_collection') : t('debts.select_days')}
          </Label>
          {collectionType === 'daily' ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
              ✅ {t('debts.daily_all_days')}
            </p>
          ) : (
            <QuickDayPicker
              onSelectDate={() => {}}
              multiSelect
              selectedDays={collectionDays}
              onSelectDays={setCollectionDays}
            />
          )}
        </div>
      )}

      {/* Collection amount */}
      {collectionType !== 'none' && (
        <div className="space-y-2">
          <Label className="text-xs">{t('debts.collection_amount')}</Label>
          <Input
            type="number"
            value={collectionAmount}
            onChange={e => setCollectionAmount(e.target.value)}
            placeholder={t('debts.amount_optional')}
            min={0}
          />
          {estimatedInfo && (
            <p className="text-xs text-primary bg-primary/10 rounded px-2 py-1">
              📅 {estimatedInfo}
            </p>
          )}
        </div>
      )}

      {/* Save button */}
      {hasChanges && (
        <Button
          size="sm"
          className="w-full"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          {t('debts.save_schedule')}
        </Button>
      )}
    </div>
  );
};

export default DebtScheduleSection;
