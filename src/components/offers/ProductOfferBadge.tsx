import React, { useState, useEffect } from 'react';
import { Gift, Calendar, Users, Sparkles, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLanguage } from '@/contexts/LanguageContext';
import { ProductOfferWithDetails } from '@/types/productOffer';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ProductOfferBadgeProps {
  productId: string;
  quantity: number;
  piecesPerBox?: number;
  onGiftCalculated?: (giftPieces: number, offerId?: string) => void;
}

const ProductOfferBadge: React.FC<ProductOfferBadgeProps> = ({ 
  productId, 
  quantity, 
  piecesPerBox = 1,
  onGiftCalculated 
}) => {
  const { t, language, dir } = useLanguage();
  const [offers, setOffers] = useState<ProductOfferWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<ProductOfferWithDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : enUS;

  useEffect(() => {
    fetchProductOffers();
  }, [productId]);

  const fetchProductOffers = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('product_offers')
        .select(`
          *,
          product:products!product_offers_product_id_fkey(id, name),
          gift_product:products!product_offers_gift_product_id_fkey(id, name),
          tiers:product_offer_tiers(
            id, offer_id, min_quantity, max_quantity, min_quantity_unit,
            gift_quantity, gift_quantity_unit, gift_type, gift_product_id,
            discount_percentage, worker_reward_type, worker_reward_amount, tier_order,
            gift_product:products(id, name)
          )
        `)
        .eq('product_id', productId)
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('priority', { ascending: false });

      if (error) throw error;
      // Sort tiers by tier_order
      const offersWithSortedTiers = (data || []).map((offer: any) => ({
        ...offer,
        tiers: offer.tiers?.sort((a: any, b: any) => a.tier_order - b.tier_order) || [],
      }));
      setOffers(offersWithSortedTiers);
    } catch (error) {
      console.error('Error fetching product offers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUnitLabel = (unit: string) => {
    return unit === 'box' ? t('offers.unit_box') : t('offers.unit_piece');
  };

  const getGiftText = (offer: ProductOfferWithDetails) => {
    const unitLabel = getUnitLabel(offer.gift_quantity_unit || 'piece');
    if (offer.gift_type === 'same_product') {
      return `${offer.gift_quantity} ${unitLabel} ${t('common.free')}`;
    } else if (offer.gift_type === 'different_product' && offer.gift_product) {
      return `${offer.gift_quantity} ${unitLabel} ${offer.gift_product.name}`;
    } else if (offer.gift_type === 'discount') {
      return `${offer.discount_percentage}% ${t('offers.discount')}`;
    }
    return '';
  };

  const getWorkerRewardText = (offer: ProductOfferWithDetails) => {
    if (offer.worker_reward_type === 'none') return null;
    if (offer.worker_reward_type === 'fixed') {
      return `${offer.worker_reward_amount} ${t('currency.dzd')}`;
    }
    return `${offer.worker_reward_amount}%`;
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const today = new Date();
    const end = new Date(endDate);
    return differenceInDays(end, today);
  };

  // Calculate gift pieces for an offer based on quantity, using tiers if available
  // For multiplier offers with multiple tiers: apply highest tier first, then use remaining qty with lower tiers
  const calculateGiftPieces = (offer: ProductOfferWithDetails, qty: number): number => {
    const tiers = offer.tiers && offer.tiers.length > 0 ? offer.tiers : null;
    
    if (tiers) {
      if (offer.condition_type === 'multiplier') {
        // Sort tiers by min_quantity descending (highest first)
        const sortedTiers = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity);
        let remaining = qty;
        let totalGift = 0;
        
        for (const tier of sortedTiers) {
          if (remaining < tier.min_quantity) continue;
          
          const timesApplied = Math.floor(remaining / tier.min_quantity);
          remaining = remaining % tier.min_quantity;
          
          const giftUnit = tier.gift_quantity_unit || 'piece';
          const giftAmount = timesApplied * tier.gift_quantity;
          totalGift += giftUnit === 'box' ? giftAmount * piecesPerBox : giftAmount;
        }
        return totalGift;
      } else {
        // Range type: find the single matching tier
        for (const tier of [...tiers].sort((a, b) => b.min_quantity - a.min_quantity)) {
          if (qty >= tier.min_quantity && (tier.max_quantity === null || qty <= tier.max_quantity)) {
            const giftUnit = tier.gift_quantity_unit || 'piece';
            return giftUnit === 'box' ? tier.gift_quantity * piecesPerBox : tier.gift_quantity;
          }
        }
        return 0;
      }
    }
    
    // Fallback to offer-level fields
    if (qty < offer.min_quantity) return 0;
    
    const timesApplied = offer.condition_type === 'multiplier'
      ? Math.floor(qty / offer.min_quantity)
      : 1;
    
    const giftPerThreshold = offer.gift_quantity;
    
    if (offer.gift_quantity_unit === 'box') {
      return timesApplied * giftPerThreshold * piecesPerBox;
    }
    
    return timesApplied * giftPerThreshold;
  };

  // Find applicable offers based on quantity (using tiers or offer-level)
  const applicableOffers = offers.filter(offer => {
    const tiers = offer.tiers && offer.tiers.length > 0 ? offer.tiers : null;
    if (tiers) {
      // For multiplier: applicable if qty >= lowest tier min_quantity
      const lowestMin = Math.min(...tiers.map(t => t.min_quantity));
      return quantity >= lowestMin;
    }
    return quantity >= offer.min_quantity && (offer.max_quantity === null || quantity <= offer.max_quantity);
  });

  // Calculate total gift pieces from all applicable offers
  const totalGiftPieces = applicableOffers.reduce((total, offer) => {
    return total + calculateGiftPieces(offer, quantity);
  }, 0);

  // Find the primary applicable offer ID
  const primaryOfferId = applicableOffers.length > 0 ? applicableOffers[0].id : undefined;

  // Notify parent of gift calculation
  useEffect(() => {
    if (onGiftCalculated) {
      onGiftCalculated(totalGiftPieces, primaryOfferId);
    }
  }, [totalGiftPieces, primaryOfferId, onGiftCalculated]);

  const handleOfferClick = (offer: ProductOfferWithDetails) => {
    setSelectedOffer(offer);
    setIsDialogOpen(true);
  };

  if (isLoading || offers.length === 0) {
    return null;
  }

  // Render a single offer card
  const renderOfferCard = (offer: ProductOfferWithDetails) => {
    const isApplicable = applicableOffers.includes(offer);
    const daysRemaining = getDaysRemaining(offer.end_date);
    const giftPieces = calculateGiftPieces(offer, quantity);
    const timesApplied = quantity >= offer.min_quantity ? Math.floor(quantity / offer.min_quantity) : 0;
    
    return (
      <div
        key={offer.id}
        onClick={() => handleOfferClick(offer)}
        className={cn(
          "relative overflow-hidden rounded-lg p-3 cursor-pointer transition-all duration-300 border-2",
          isApplicable 
            ? "bg-green-600 text-white border-green-500 animate-pulse shadow-lg shadow-green-500/40" 
            : "bg-destructive text-white border-destructive"
        )}
      >
        {/* Success icon for applicable offers */}
        {isApplicable && (
          <div className="absolute top-1 end-1">
            <div className="bg-white rounded-full p-0.5">
              <Check className="w-4 h-4 text-green-600" />
            </div>
          </div>
        )}
        
        <div className="flex items-start gap-2">
          <Gift className="w-5 h-5 flex-shrink-0 mt-0.5 text-white" />
          
          <div className="flex-1 min-w-0">
            {/* Status Badge */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge 
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  isApplicable 
                    ? "bg-white/20 text-white border-white/30" 
                    : "bg-white/20 text-white border-white/30"
                )}
              >
                {isApplicable ? t('offers.offer_applied') : t('offers.available_offer')}
              </Badge>
              
              {/* Days remaining badge */}
              {daysRemaining !== null && (
                <Badge 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0 bg-white/20 text-white border-white/30"
                >
                  {daysRemaining === 0 
                    ? t('offers.ends_today')
                    : daysRemaining === 1 
                      ? t('offers.ends_tomorrow')
                      : `${t('offers.days_remaining')}: ${daysRemaining}`
                  }
                </Badge>
              )}
            </div>
            
            {/* Offer condition and reward */}
            <p className="text-sm font-bold text-white">
              {t('offers.buy')} {offer.min_quantity}+ → {getGiftText(offer)}
            </p>
            
            {/* Gift calculation when applicable */}
            {isApplicable && giftPieces > 0 && (
              <div className="mt-2 p-2 bg-white/20 rounded-md">
                <div className="flex items-center gap-1 text-xs text-white">
                  <Sparkles className="w-3 h-3" />
                  <span className="font-bold">
                    {t('offers.you_get')}: +{giftPieces} {t('offers.unit_piece')} {t('common.free')}
                  </span>
                </div>
                <p className="text-[10px] text-white/80 mt-0.5">
                  ({timesApplied} × {offer.gift_quantity} {getUnitLabel(offer.gift_quantity_unit || 'piece')})
                </p>
              </div>
            )}
            
            {/* Worker reward if exists */}
            {getWorkerRewardText(offer) && (
              <div className="flex items-center gap-1 mt-1 text-xs text-white/80">
                <Users className="w-3 h-3" />
                <span>{t('offers.your_reward')}: {getWorkerRewardText(offer)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-2 mt-3">
        {/* Show first offer always */}
        {offers.length > 0 && renderOfferCard(offers[0])}
        
        {/* If more than one offer, show collapsible for the rest */}
        {offers.length > 1 && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  {t('offers.hide_other_tiers')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  {t('offers.show_other_tiers')} ({offers.length - 1})
                </>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {offers.slice(1).map(renderOfferCard)}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Offer Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              {selectedOffer?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedOffer && (
            <div className="space-y-4">
              {/* Condition and Reward */}
              <div className="bg-gradient-to-r from-destructive/10 to-destructive/5 rounded-lg p-4 border border-destructive/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('offers.condition')}</p>
                    <p className="font-bold text-lg">
                      {t('offers.buy')} {selectedOffer.min_quantity}
                      {selectedOffer.max_quantity ? `-${selectedOffer.max_quantity}` : '+'} {getUnitLabel(selectedOffer.min_quantity_unit || 'piece')}
                    </p>
                  </div>
                  <div className="text-2xl">→</div>
                  <div className="text-end">
                    <p className="text-sm text-muted-foreground">{t('offers.get')}</p>
                    <p className="font-bold text-lg text-destructive">
                      {getGiftText(selectedOffer)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Worker Reward */}
              {getWorkerRewardText(selectedOffer) && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <Users className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('offers.your_reward')}</p>
                    <p className="font-bold text-blue-600">
                      {getWorkerRewardText(selectedOffer)}
                    </p>
                  </div>
                </div>
              )}

              {/* Date Range */}
              {(selectedOffer.start_date || selectedOffer.end_date) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {selectedOffer.start_date && format(new Date(selectedOffer.start_date), 'EEEE dd MMM yyyy', { locale: dateLocale })}
                    {selectedOffer.start_date && selectedOffer.end_date && ' - '}
                    {selectedOffer.end_date && format(new Date(selectedOffer.end_date), 'EEEE dd MMM yyyy', { locale: dateLocale })}
                  </span>
                </div>
              )}

              {/* Description */}
              {selectedOffer.description && (
                <p className="text-sm text-muted-foreground border-t pt-3">
                  {selectedOffer.description}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProductOfferBadge;
