import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { 
  Gift, Plus, Search, Edit2, Trash2, Package, 
  Calendar, Users, Layers, ArrowLeft
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProductOffers } from '@/hooks/useProductOffers';
import { ProductOfferWithDetails } from '@/types/productOffer';
import CreateOfferDialog from '@/components/offers/CreateOfferDialog';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIsElementHidden } from '@/hooks/useUIOverrides';

const ProductOffers: React.FC = () => {
  const { t, language, dir } = useLanguage();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { offers, isLoading, fetchOffers, deleteOffer, toggleOfferStatus } = useProductOffers();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editOffer, setEditOffer] = useState<ProductOfferWithDetails | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : enUS;
  
  const isAdmin = role === 'admin';
  const isBranchAdmin = role === 'branch_admin';
  const canManage = isAdmin || isBranchAdmin;
  const isAddOfferHidden = useIsElementHidden('button', 'add_offer');

  useEffect(() => {
    if (!canManage) {
      navigate('/');
    }
  }, [canManage, navigate]);

  const filteredOffers = offers.filter(offer => 
    offer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    offer.product?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (offer: ProductOfferWithDetails) => {
    setEditOffer(offer);
    setShowCreateDialog(true);
  };

  const handleDelete = async (id: string) => {
    await deleteOffer(id);
    setDeleteConfirm(null);
  };

  const getGiftText = (offer: ProductOfferWithDetails) => {
    if (offer.gift_type === 'same_product') {
      return `${offer.gift_quantity} ${t('offers.free_units')}`;
    } else if (offer.gift_type === 'different_product' && offer.gift_product) {
      return `${offer.gift_quantity} ${offer.gift_product.name}`;
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

  return (
    <>
      <div className="p-4 space-y-4" dir={dir}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Gift className="w-6 h-6 text-primary" />
                {t('offers.management')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('offers.management_desc')}</p>
            </div>
          </div>
          {!isAddOfferHidden && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 me-2" />
              {t('offers.new')}
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search')}
            className="ps-10"
          />
        </div>

        {/* Offers List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : filteredOffers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Gift className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('offers.no_offers')}</p>
              </CardContent>
            </Card>
          ) : (
            filteredOffers.map((offer) => (
              <Card key={offer.id} className={!offer.is_active ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {offer.name}
                        {offer.is_stackable && (
                          <Badge variant="outline" className="text-xs">
                            <Layers className="w-3 h-3 me-1" />
                            {t('offers.stackable')}
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Package className="w-3 h-3" />
                        {offer.product?.name}
                      </p>
                    </div>
                    <Switch
                      checked={offer.is_active}
                      onCheckedChange={(checked) => toggleOfferStatus(offer.id, checked)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Tiers */}
                  <div className="space-y-2">
                    {(offer.tiers && offer.tiers.length > 0 ? offer.tiers : [{
                      min_quantity: offer.min_quantity,
                      max_quantity: offer.max_quantity,
                      gift_type: offer.gift_type,
                      gift_quantity: offer.gift_quantity,
                      gift_product: offer.gift_product,
                      discount_percentage: offer.discount_percentage,
                      worker_reward_type: offer.worker_reward_type,
                      worker_reward_amount: offer.worker_reward_amount,
                    }]).map((tier: any, index: number) => (
                      <div key={index} className="flex flex-wrap items-center gap-2 p-2 bg-muted/50 rounded">
                        <Badge variant="outline" className="text-xs">
                          {t('offers.tier')} {index + 1}
                        </Badge>
                        <Badge variant="secondary">
                          {t('offers.buy')} {tier.min_quantity}
                          {tier.max_quantity ? `-${tier.max_quantity}` : '+'}
                        </Badge>
                        <Badge className="bg-accent text-accent-foreground">
                          → {tier.gift_type === 'same_product' 
                            ? `${tier.gift_quantity} ${t('offers.free_units')}`
                            : tier.gift_type === 'different_product' && tier.gift_product
                            ? `${tier.gift_quantity} ${tier.gift_product.name}`
                            : `${tier.discount_percentage}% ${t('offers.discount')}`}
                        </Badge>
                        {tier.worker_reward_type !== 'none' && tier.worker_reward_amount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <Users className="w-3 h-3 me-1" />
                            {tier.worker_reward_type === 'fixed' 
                              ? `${tier.worker_reward_amount} ${t('currency.dzd')}`
                              : `${tier.worker_reward_amount}%`}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>


                  {/* Dates */}
                  {(offer.start_date || offer.end_date) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {offer.start_date && format(new Date(offer.start_date), 'dd MMM yyyy', { locale: dateLocale })}
                      {offer.start_date && offer.end_date && ' - '}
                      {offer.end_date && format(new Date(offer.end_date), 'dd MMM yyyy', { locale: dateLocale })}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(offer)}
                    >
                      <Edit2 className="w-4 h-4 me-2" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(offer.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <CreateOfferDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditOffer(null);
        }}
        onSuccess={() => {
          fetchOffers();
          setEditOffer(null);
        }}
        editOffer={editOffer}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('offers.delete_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('offers.delete_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProductOffers;
