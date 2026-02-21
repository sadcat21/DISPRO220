import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StampPriceTier } from '@/types/stamp';

export const useStampTiers = () => {
  return useQuery({
    queryKey: ['stamp-price-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stamp_price_tiers')
        .select('*')
        .order('min_amount', { ascending: true });

      if (error) throw error;
      return data as StampPriceTier[];
    },
  });
};

export const useActiveStampTiers = () => {
  return useQuery({
    queryKey: ['stamp-price-tiers', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stamp_price_tiers')
        .select('*')
        .eq('is_active', true)
        .order('min_amount', { ascending: true });

      if (error) throw error;
      return data as StampPriceTier[];
    },
  });
};

export const useCreateStampTier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tier: Omit<StampPriceTier, 'id' | 'created_at' | 'created_by'>) => {
      const { data, error } = await supabase
        .from('stamp_price_tiers')
        .insert(tier)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stamp-price-tiers'] });
    },
  });
};

export const useUpdateStampTier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...tier }: Partial<StampPriceTier> & { id: string }) => {
      const { data, error } = await supabase
        .from('stamp_price_tiers')
        .update(tier)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stamp-price-tiers'] });
    },
  });
};

export const useDeleteStampTier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stamp_price_tiers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stamp-price-tiers'] });
    },
  });
};

// حساب مبلغ الطابع بناءً على المبلغ الإجمالي
export const calculateStampAmount = (totalAmount: number, tiers: StampPriceTier[]): number => {
  const activeTiers = tiers.filter(t => t.is_active);
  
  for (const tier of activeTiers) {
    const minOk = totalAmount >= tier.min_amount;
    const maxOk = tier.max_amount === null || totalAmount <= tier.max_amount;
    
    if (minOk && maxOk) {
      return totalAmount * tier.percentage / 100;
    }
  }
  
  return 0;
};
