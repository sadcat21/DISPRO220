import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface PromoSplit {
  id: string;
  offer_id: string | null;
  product_id: string;
  split_type: 'quantity_accumulation' | 'customer_group';
  name: string;
  target_quantity: number;
  target_quantity_unit: string;
  gift_quantity: number;
  gift_quantity_unit: string;
  adjusted_gift_quantity: number | null;
  gift_product_id: string | null;
  status: string;
  notes: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromoSplitCustomer {
  id: string;
  split_id: string;
  customer_id: string;
  allocated_quantity: number;
  delivered_quantity: number;
  gift_share: number;
  gift_delivered: boolean;
  notes: string | null;
  created_at: string;
  customer?: { id: string; name: string; phone: string | null; sector_id: string | null };
}

export interface PromoSplitInstallment {
  id: string;
  split_customer_id: string;
  scheduled_date: string;
  planned_quantity: number;
  actual_quantity: number;
  status: string;
  notes: string | null;
}

export interface PromoSplitWithDetails extends PromoSplit {
  product?: { id: string; name: string; pieces_per_box: number | null };
  gift_product?: { id: string; name: string } | null;
  offer?: { id: string; name: string } | null;
  customers?: PromoSplitCustomer[];
}

export const usePromoSplits = () => {
  const [splits, setSplits] = useState<PromoSplitWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { activeBranch } = useAuth();

  const fetchSplits = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('promo_splits')
        .select(`
          *,
          product:products!promo_splits_product_id_fkey(id, name, pieces_per_box),
          gift_product:products!promo_splits_gift_product_id_fkey(id, name),
          offer:product_offers!promo_splits_offer_id_fkey(id, name),
          customers:promo_split_customers(
            id, split_id, customer_id, allocated_quantity, delivered_quantity, gift_share, gift_delivered, notes, created_at,
            customer:customers(id, name, phone, sector_id)
          )
        `)
        .order('created_at', { ascending: false });

      if (activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSplits((data as any) || []);
    } catch (error) {
      console.error('Error fetching promo splits:', error);
      toast.error('فشل تحميل تجزئة العروض');
    } finally {
      setIsLoading(false);
    }
  };

  const createSplit = async (split: Partial<PromoSplit>) => {
    try {
      const { data, error } = await supabase
        .from('promo_splits')
        .insert(split as any)
        .select()
        .single();
      if (error) throw error;
      toast.success('تم إنشاء تجزئة العرض بنجاح');
      await fetchSplits();
      return data;
    } catch (error: any) {
      toast.error(error.message || 'فشل إنشاء تجزئة العرض');
      throw error;
    }
  };

  const updateSplit = async (id: string, updates: Partial<PromoSplit>) => {
    try {
      const { error } = await supabase
        .from('promo_splits')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('تم التحديث بنجاح');
      await fetchSplits();
    } catch (error: any) {
      toast.error(error.message || 'فشل التحديث');
      throw error;
    }
  };

  const deleteSplit = async (id: string) => {
    try {
      const { error } = await supabase.from('promo_splits').delete().eq('id', id);
      if (error) throw error;
      toast.success('تم الحذف بنجاح');
      await fetchSplits();
    } catch (error: any) {
      toast.error(error.message || 'فشل الحذف');
      throw error;
    }
  };

  const addCustomer = async (splitCustomer: { split_id: string; customer_id: string; allocated_quantity: number; gift_share: number }) => {
    try {
      const { error } = await supabase.from('promo_split_customers').insert(splitCustomer as any);
      if (error) throw error;
      toast.success('تمت إضافة العميل');
      await fetchSplits();
    } catch (error: any) {
      toast.error(error.message || 'فشل إضافة العميل');
      throw error;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<PromoSplitCustomer>) => {
    try {
      const { error } = await supabase.from('promo_split_customers').update(updates as any).eq('id', id);
      if (error) throw error;
      await fetchSplits();
    } catch (error: any) {
      toast.error(error.message || 'فشل التحديث');
      throw error;
    }
  };

  const removeCustomer = async (id: string) => {
    try {
      const { error } = await supabase.from('promo_split_customers').delete().eq('id', id);
      if (error) throw error;
      toast.success('تمت إزالة العميل');
      await fetchSplits();
    } catch (error: any) {
      toast.error(error.message || 'فشل الإزالة');
      throw error;
    }
  };

  // Installments
  const addInstallment = async (installment: { split_customer_id: string; scheduled_date: string; planned_quantity: number }) => {
    try {
      const { error } = await supabase.from('promo_split_installments').insert(installment as any);
      if (error) throw error;
      toast.success('تمت إضافة الدفعة');
    } catch (error: any) {
      toast.error(error.message || 'فشل إضافة الدفعة');
      throw error;
    }
  };

  const updateInstallment = async (id: string, updates: Partial<PromoSplitInstallment>) => {
    try {
      const { error } = await supabase.from('promo_split_installments').update(updates as any).eq('id', id);
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || 'فشل التحديث');
      throw error;
    }
  };

  const fetchInstallments = async (splitCustomerId: string): Promise<PromoSplitInstallment[]> => {
    const { data, error } = await supabase
      .from('promo_split_installments')
      .select('*')
      .eq('split_customer_id', splitCustomerId)
      .order('scheduled_date', { ascending: true });
    if (error) throw error;
    return (data as any) || [];
  };

  useEffect(() => {
    fetchSplits();
    const channel = supabase
      .channel('promo-splits-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_splits' }, () => fetchSplits())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_split_customers' }, () => fetchSplits())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBranch?.id]);

  return {
    splits, isLoading, fetchSplits,
    createSplit, updateSplit, deleteSplit,
    addCustomer, updateCustomer, removeCustomer,
    addInstallment, updateInstallment, fetchInstallments,
  };
};
