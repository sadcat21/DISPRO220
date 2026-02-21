import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/components/layout/MobileLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gift, Package, Calendar, Users, ArrowLeft, Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ProductOfferWithDetails } from '@/types/productOffer';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';

const AvailableOffers: React.FC = () => {
  const { t, language, dir } = useLanguage();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<ProductOfferWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : enUS;

  useEffect(() => {
    fetchActiveOffers();
  }, []);

  const fetchActiveOffers = async () => {
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
    const end = new Date(endDate);
    const today = new Date();
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" dir={dir}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-500" />
              {t('offers.available')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('offers.available_desc')}</p>
          </div>
        </div>

        {/* Offers List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : offers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Gift className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium text-muted-foreground">{t('offers.no_active_offers')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('offers.check_later')}</p>
              </CardContent>
            </Card>
          ) : (
            offers.map((offer) => {
              const daysRemaining = getDaysRemaining(offer.end_date);
              const isEndingSoon = daysRemaining !== null && daysRemaining <= 3;

              return (
                <Card 
                  key={offer.id} 
                  className={`overflow-hidden ${isEndingSoon ? 'border-amber-500 border-2' : ''}`}
                >
                  {/* Offer Header */}
                  <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="w-5 h-5" />
                        <span className="font-bold">{offer.name}</span>
                      </div>
                      {isEndingSoon && (
                        <Badge variant="secondary" className="bg-white/20 text-white">
                          {daysRemaining === 0 
                            ? t('offers.ends_today')
                            : `${daysRemaining} ${t('offers.days_left')}`}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-4">
                    {/* Product */}
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{offer.product?.name}</p>
                        <p className="text-xs text-muted-foreground">{t('offers.product')}</p>
                      </div>
                    </div>

                    {/* Condition and Reward */}
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{t('offers.condition')}</p>
                          <p className="font-bold text-lg">
                            {t('offers.buy')} {offer.min_quantity}
                            {offer.max_quantity ? `-${offer.max_quantity}` : '+'} {getUnitLabel(offer.min_quantity_unit || 'piece')}
                          </p>
                        </div>
                        <div className="text-2xl">→</div>
                        <div className="text-end">
                          <p className="text-sm text-muted-foreground">{t('offers.get')}</p>
                          <p className="font-bold text-lg text-emerald-600">
                            {getGiftText(offer)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Worker Reward */}
                    {getWorkerRewardText(offer) && (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                        <Users className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="text-sm text-muted-foreground">{t('offers.your_reward')}</p>
                          <p className="font-bold text-blue-600">
                            {getWorkerRewardText(offer)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Date Range */}
                    {(offer.start_date || offer.end_date) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {offer.start_date && format(new Date(offer.start_date), 'dd MMM yyyy', { locale: dateLocale })}
                          {offer.start_date && offer.end_date && ' - '}
                          {offer.end_date && format(new Date(offer.end_date), 'dd MMM yyyy', { locale: dateLocale })}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    {offer.description && (
                      <p className="text-sm text-muted-foreground border-t pt-3">
                        {offer.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default AvailableOffers;
