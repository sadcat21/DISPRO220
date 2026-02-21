import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Package, Calendar, Users, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { ProductOfferWithDetails } from '@/types/productOffer';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';

const OffersNotification: React.FC = () => {
  const { t, language, dir } = useLanguage();
  const [offers, setOffers] = useState<ProductOfferWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<ProductOfferWithDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : enUS;

  // Arabic day names
  const arabicDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const frenchDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const getDayName = (date: Date) => {
    const dayIndex = date.getDay();
    if (language === 'ar') return arabicDays[dayIndex];
    if (language === 'fr') return frenchDays[dayIndex];
    return englishDays[dayIndex];
  };

  const formatDateWithDay = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayName = getDayName(date);
    const formattedDate = format(date, 'dd MMM yyyy', { locale: dateLocale });
    return `${dayName}، ${formattedDate}`;
  };

  const fetchActiveOffers = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('product_offers')
        .select(`
          *,
          product:products!product_offers_product_id_fkey(id, name),
          gift_product:products!product_offers_gift_product_id_fkey(id, name),
          branch:branches(id, name)
        `)
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('priority', { ascending: false });

      if (error) throw error;
      setOffers(data || []);
    } catch (error) {
      console.error('Error fetching offers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveOffers();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('product_offers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_offers'
        },
        () => {
          fetchActiveOffers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActiveOffers]);

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

  const handleOfferClick = (offer: ProductOfferWithDetails) => {
    setSelectedOffer(offer);
    setIsPopoverOpen(false);
    setIsDialogOpen(true);
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getDaysRemainingBadge = (daysRemaining: number | null) => {
    if (daysRemaining === null) {
      return (
        <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200">
          <Sparkles className="w-3 h-3 me-1" />
          {t('offers.unlimited')}
        </Badge>
      );
    }
    
    if (daysRemaining === 0) {
      return (
        <Badge variant="destructive" className="text-xs animate-pulse">
          <Clock className="w-3 h-3 me-1" />
          {t('offers.ends_today')}
        </Badge>
      );
    }
    
    if (daysRemaining <= 3) {
      return (
        <Badge variant="destructive" className="text-xs">
          <Clock className="w-3 h-3 me-1" />
          {daysRemaining} {t('offers.days_left')}
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary" className="text-xs">
        <Clock className="w-3 h-3 me-1" />
        {daysRemaining} {t('offers.days_left')}
      </Badge>
    );
  };

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative w-8 h-8 bg-red-500/10 hover:bg-red-500/20">
            <Gift className="w-4 h-4 text-red-500" />
            {offers.length > 0 && (
              <Badge 
                className="absolute -top-1 -end-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0"
              >
                {offers.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-96 p-0" 
          align="end"
          dir={dir}
        >
          <div className="p-3 border-b bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              <span className="font-semibold">{t('offers.available')}</span>
              <Badge variant="secondary" className="ms-auto bg-white/20 text-white border-0">
                {offers.length}
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="max-h-96">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : offers.length === 0 ? (
              <div className="p-6 text-center">
                <Gift className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">{t('offers.no_active_offers')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('offers.check_later')}</p>
              </div>
            ) : (
              <div className="divide-y">
                {offers.map((offer) => {
                  const daysRemaining = getDaysRemaining(offer.end_date);
                  const isEndingSoon = daysRemaining !== null && daysRemaining <= 3;

                  return (
                    <button
                      key={offer.id}
                      className={`w-full p-4 text-start hover:bg-muted/50 transition-colors ${
                        isEndingSoon ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                      }`}
                      onClick={() => handleOfferClick(offer)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isEndingSoon 
                            ? 'bg-gradient-to-br from-red-500 to-orange-500' 
                            : 'bg-gradient-to-br from-green-500 to-emerald-500'
                        }`}>
                          <Gift className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm truncate">{offer.name}</p>
                            {getDaysRemainingBadge(daysRemaining)}
                          </div>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {offer.product?.name}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <Badge variant="outline" className="text-xs bg-primary/5">
                              {t('offers.buy')} {offer.min_quantity}+ {getUnitLabel(offer.min_quantity_unit || 'piece')}
                            </Badge>
                            <Badge className="text-xs bg-emerald-500 text-white border-0">
                              → {getGiftText(offer)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Offer Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white -m-6 mb-0 p-4 rounded-t-lg">
            <DialogTitle className="flex items-center gap-2 text-white">
              <Gift className="w-5 h-5" />
              {selectedOffer?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedOffer && (
            <div className="space-y-4 pt-2">
              {/* Days Remaining Badge */}
              <div className="flex justify-center">
                {getDaysRemainingBadge(getDaysRemaining(selectedOffer.end_date))}
              </div>

              {/* Product */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedOffer.product?.name}</p>
                  <p className="text-xs text-muted-foreground">{t('offers.product')}</p>
                </div>
              </div>

              {/* Condition and Reward */}
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('offers.condition')}</p>
                    <p className="font-bold text-lg">
                      {t('offers.buy')} {selectedOffer.min_quantity}
                      {selectedOffer.max_quantity ? `-${selectedOffer.max_quantity}` : '+'} {getUnitLabel(selectedOffer.min_quantity_unit || 'piece')}
                    </p>
                  </div>
                  <div className="text-2xl text-emerald-500">→</div>
                  <div className="text-end">
                    <p className="text-sm text-muted-foreground">{t('offers.get')}</p>
                    <p className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                      {getGiftText(selectedOffer)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Worker Reward */}
              {getWorkerRewardText(selectedOffer) && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Users className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('offers.your_reward')}</p>
                    <p className="font-bold text-blue-600 dark:text-blue-400">
                      {getWorkerRewardText(selectedOffer)}
                    </p>
                  </div>
                </div>
              )}

              {/* Date Range with Day Names */}
              {(selectedOffer.start_date || selectedOffer.end_date) && (
                <div className="flex items-center gap-2 text-sm p-3 bg-muted/50 rounded-lg">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {selectedOffer.start_date && formatDateWithDay(selectedOffer.start_date)}
                    {selectedOffer.start_date && selectedOffer.end_date && ' - '}
                    {selectedOffer.end_date && formatDateWithDay(selectedOffer.end_date)}
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

export default OffersNotification;