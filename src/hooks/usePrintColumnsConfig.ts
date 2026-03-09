import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { DEFAULT_PRINT_COLUMNS, PrintColumnConfig } from '@/components/print/PrintColumnsConfigDialog';

const PRINT_COLUMNS_KEY = 'print_columns_config_v1';

export const usePrintColumnsConfig = () => {
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['print-columns-config', activeBranch?.id ?? 'global'],
    queryFn: async (): Promise<PrintColumnConfig[]> => {
      const branchId = activeBranch?.id ?? null;

      // Try branch-specific first
      if (branchId) {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', PRINT_COLUMNS_KEY)
          .eq('branch_id', branchId)
          .maybeSingle();

        if (!error && data?.value) {
          try {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            return mergeWithDefaults(parsed);
          } catch {
            // fall through
          }
        }
      }

      // Fallback to global
      const { data: globalData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', PRINT_COLUMNS_KEY)
        .is('branch_id', null)
        .maybeSingle();

      if (globalData?.value) {
        try {
          const parsed = typeof globalData.value === 'string' ? JSON.parse(globalData.value) : globalData.value;
          return mergeWithDefaults(parsed);
        } catch {
          // fall through
        }
      }

      // Check localStorage migration
      const local = localStorage.getItem('print_columns_config');
      if (local) {
        try {
          return mergeWithDefaults(JSON.parse(local));
        } catch {
          // fall through
        }
      }

      return [...DEFAULT_PRINT_COLUMNS];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (columns: PrintColumnConfig[]) => {
      const branchId = activeBranch?.id ?? null;
      const updatedAt = new Date().toISOString();

      const updatePayload = {
        value: JSON.stringify(columns),
        updated_by: workerId ?? null,
        updated_at: updatedAt,
      };

      let updateQuery = supabase
        .from('app_settings')
        .update(updatePayload)
        .eq('key', PRINT_COLUMNS_KEY)
        .select('id');

      if (branchId) {
        updateQuery = updateQuery.eq('branch_id', branchId);
      } else {
        updateQuery = updateQuery.is('branch_id', null);
      }

      const { data: updatedRows, error: updateError } = await updateQuery;
      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertError } = await supabase.from('app_settings').insert({
          key: PRINT_COLUMNS_KEY,
          branch_id: branchId,
          ...updatePayload,
        });
        if (insertError) throw insertError;
      }

      // Clean up localStorage after successful DB save
      localStorage.removeItem('print_columns_config');

      return columns;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-columns-config'] });
      toast.success('تم حفظ إعدادات أعمدة الطباعة');
    },
    onError: (error: unknown) => {
      console.error('Error saving print columns config:', error);
      toast.error('تعذر حفظ إعدادات أعمدة الطباعة');
    },
  });

  return {
    columns: query.data ?? [...DEFAULT_PRINT_COLUMNS],
    isLoading: query.isLoading,
    saveColumns: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
};

/** Merge saved config with defaults to handle new columns added later */
function mergeWithDefaults(saved: PrintColumnConfig[]): PrintColumnConfig[] {
  if (!Array.isArray(saved)) return [...DEFAULT_PRINT_COLUMNS];

  const savedMap = new Map(saved.map(c => [c.id, c]));
  const merged: PrintColumnConfig[] = [];

  // Keep saved order for existing columns
  for (const s of saved) {
    const def = DEFAULT_PRINT_COLUMNS.find(d => d.id === s.id);
    if (def) {
      merged.push({ ...def, visible: s.visible });
    }
  }

  // Add any new default columns not in saved
  for (const def of DEFAULT_PRINT_COLUMNS) {
    if (!savedMap.has(def.id)) {
      merged.push({ ...def });
    }
  }

  return merged;
}
