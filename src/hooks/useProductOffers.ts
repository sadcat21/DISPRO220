import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductOffer, ProductOfferWithDetails } from '@/types/productOffer';
import { toast } from 'sonner';

export const useProductOffers = () => {
  const [offers, setOffers] = useState<ProductOfferWithDetails[]>([]);
  const [activeOffers, setActiveOffers] = useState<ProductOfferWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOffers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_offers')
        .select(`
          *,
          product:products!product_offers_product_id_fkey(id, name, pieces_per_box),
          gift_product:products!product_offers_gift_product_id_fkey(id, name),
          branch:branches(id, name),
          tiers:product_offer_tiers(
            id, offer_id, min_quantity, max_quantity, min_quantity_unit,
            gift_quantity, gift_quantity_unit, gift_type, gift_product_id,
            discount_percentage, discount_amount, discount_prices, worker_reward_type, worker_reward_amount, tier_order, is_stackable, conditions,
            gift_product:products(id, name)
          )
        `)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Sort tiers by tier_order and cast discount_prices
      const offersWithSortedTiers = (data || []).map(offer => ({
        ...offer,
        discount_prices: offer.discount_prices as any,
        tiers: (offer.tiers || [])
          .map((t: any) => ({ ...t, discount_prices: t.discount_prices as any }))
          .sort((a: any, b: any) => a.tier_order - b.tier_order),
      })) as any;
      
      setOffers(offersWithSortedTiers);
    } catch (error) {
      console.error('Error fetching offers:', error);
      toast.error('فشل تحميل العروض');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveOffers = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('product_offers')
        .select(`
          *,
          product:products!product_offers_product_id_fkey(id, name, pieces_per_box),
          gift_product:products!product_offers_gift_product_id_fkey(id, name),
          branch:branches(id, name),
          tiers:product_offer_tiers(
            id, offer_id, min_quantity, max_quantity, min_quantity_unit,
            gift_quantity, gift_quantity_unit, gift_type, gift_product_id,
            discount_percentage, discount_amount, discount_prices, worker_reward_type, worker_reward_amount, tier_order, is_stackable, conditions,
            gift_product:products(id, name)
          )
        `)
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('priority', { ascending: false });

      if (error) throw error;
      
      // Sort tiers by tier_order and cast discount_prices
      const offersWithSortedTiers = (data || []).map(offer => ({
        ...offer,
        discount_prices: offer.discount_prices as any,
        tiers: (offer.tiers || [])
          .map((t: any) => ({ ...t, discount_prices: t.discount_prices as any }))
          .sort((a: any, b: any) => a.tier_order - b.tier_order),
      })) as any;
      
      setActiveOffers(offersWithSortedTiers);
    } catch (error) {
      console.error('Error fetching active offers:', error);
    }
  };

  const createOffer = async (offer: Omit<ProductOffer, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('product_offers')
        .insert(offer)
        .select()
        .single();

      if (error) throw error;
      toast.success('تم إنشاء العرض بنجاح');
      await fetchOffers();
      return data;
    } catch (error: any) {
      console.error('Error creating offer:', error);
      toast.error(error.message || 'فشل إنشاء العرض');
      throw error;
    }
  };

  const updateOffer = async (id: string, updates: Partial<ProductOffer>) => {
    try {
      const { error } = await supabase
        .from('product_offers')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('تم تحديث العرض بنجاح');
      await fetchOffers();
    } catch (error: any) {
      console.error('Error updating offer:', error);
      toast.error(error.message || 'فشل تحديث العرض');
      throw error;
    }
  };

  const deleteOffer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('product_offers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('تم حذف العرض بنجاح');
      await fetchOffers();
    } catch (error: any) {
      console.error('Error deleting offer:', error);
      toast.error(error.message || 'فشل حذف العرض');
      throw error;
    }
  };

  const toggleOfferStatus = async (id: string, isActive: boolean) => {
    await updateOffer(id, { is_active: isActive });
  };

  useEffect(() => {
    fetchOffers();
    fetchActiveOffers();

    // Realtime for product_offers
    const baseChannelName = 'product-offers-realtime';

    // Defensive cleanup: if a channel with the same base topic exists, remove it first.
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_offers' }, () => {
        fetchOffers();
        fetchActiveOffers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return {
    offers,
    activeOffers,
    isLoading,
    fetchOffers,
    fetchActiveOffers,
    createOffer,
    updateOffer,
    deleteOffer,
    toggleOfferStatus,
  };
};
