import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, GripVertical, Gift, Users, Package } from 'lucide-react';
import SimpleProductPickerDialog from '@/components/stock/SimpleProductPickerDialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { Product } from '@/types/database';
import { ProductOfferTier } from '@/types/productOffer';

interface OfferTierCardProps {
  tier: ProductOfferTier;
  tierIndex: number;
  products: Product[];
  selectedProduct?: Product | null;
  onUpdate: (index: number, updates: Partial<ProductOfferTier>) => void;
  onDelete: (index: number) => void;
  canDelete: boolean;
  conditionType: 'range' | 'multiplier';
}

const OfferTierCard: React.FC<OfferTierCardProps> = ({
  tier,
  tierIndex,
  products,
  selectedProduct,
  onUpdate,
  onDelete,
  canDelete,
  conditionType,
}) => {
  const { t } = useLanguage();
  const [giftProductPickerOpen, setGiftProductPickerOpen] = useState(false);

  const getUnitLabel = (unit: string) => {
    return unit === 'box' ? t('offers.unit_box') : t('offers.unit_piece');
  };

  return (
    <Card className="relative border-2 border-dashed bg-muted/30">
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
            <Badge variant="secondary" className="text-xs">
              {t('offers.tier')} {tierIndex + 1}
            </Badge>
          </div>
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(tierIndex)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Quantity Condition */}
        {conditionType === 'range' ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('offers.min_quantity')}</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={1}
                  value={tier.min_quantity}
                  onChange={(e) => onUpdate(tierIndex, { min_quantity: parseInt(e.target.value) || 1 })}
                  className="flex-1 h-8 text-sm"
                />
                <Select
                  value={tier.min_quantity_unit}
                  onValueChange={(value: 'box' | 'piece') => onUpdate(tierIndex, { min_quantity_unit: value })}
                >
                  <SelectTrigger className="w-16 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece">{t('offers.unit_piece_short')}</SelectItem>
                    <SelectItem value="box">{t('offers.unit_box_short')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('offers.max_quantity')}</Label>
              <Input
                type="number"
                min={tier.min_quantity}
                value={tier.max_quantity || ''}
                onChange={(e) => onUpdate(tierIndex, { max_quantity: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="∞"
                className="h-8 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('offers.every')}</Label>
            <div className="flex gap-1 items-center">
              <Input
                type="number"
                min={1}
                value={tier.min_quantity}
                onChange={(e) => onUpdate(tierIndex, { min_quantity: parseInt(e.target.value) || 1, max_quantity: null })}
                className="flex-1 h-8 text-sm"
              />
              <Select
                value={tier.min_quantity_unit}
                onValueChange={(value: 'box' | 'piece') => onUpdate(tierIndex, { min_quantity_unit: value })}
              >
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piece">{t('offers.unit_piece_short')}</SelectItem>
                  <SelectItem value="box">{t('offers.unit_box_short')}</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground whitespace-nowrap">= {t('offers.gift')}</span>
            </div>
          </div>
        )}

        {/* Gift */}
        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded space-y-2">
          <div className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Gift className="w-3 h-3" />
            {t('offers.gift')}
          </div>
          
          <Select
            value={tier.gift_type}
            onValueChange={(value) => onUpdate(tierIndex, { gift_type: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same_product">{t('offers.same_product')}</SelectItem>
              <SelectItem value="different_product">{t('offers.different_product')}</SelectItem>
              <SelectItem value="discount">{t('offers.discount_type')}</SelectItem>
              <SelectItem value="price_discount">تخفيض في السعر (DA)</SelectItem>
            </SelectContent>
          </Select>

          {tier.gift_type !== 'discount' && tier.gift_type !== 'price_discount' && (
            <div className="flex gap-1">
              {tier.gift_type === 'different_product' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-8 text-xs justify-start"
                    onClick={() => setGiftProductPickerOpen(true)}
                  >
                    {tier.gift_product_id ? (
                      <span className="flex items-center gap-1 truncate">
                        <Package className="w-3 h-3 text-primary shrink-0" />
                        {products.find(p => p.id === tier.gift_product_id)?.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('offers.gift_product')}</span>
                    )}
                  </Button>
                  <SimpleProductPickerDialog
                    open={giftProductPickerOpen}
                    onOpenChange={setGiftProductPickerOpen}
                    products={products.map(p => ({ id: p.id, name: p.name }))}
                    selectedProductId={tier.gift_product_id || ''}
                    onSelect={(id) => onUpdate(tierIndex, { gift_product_id: id })}
                  />
                </>
              )}
              <Input
                type="number"
                min={0}
                value={tier.gift_quantity}
                onChange={(e) => onUpdate(tierIndex, { gift_quantity: parseInt(e.target.value) || 0 })}
                className={tier.gift_type === 'different_product' ? 'w-16 h-8 text-sm' : 'flex-1 h-8 text-sm'}
                placeholder={t('offers.qty')}
              />
              <Select
                value={tier.gift_quantity_unit}
                onValueChange={(value: 'box' | 'piece') => onUpdate(tierIndex, { gift_quantity_unit: value })}
              >
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piece">{t('offers.unit_piece_short')}</SelectItem>
                  <SelectItem value="box">{t('offers.unit_box_short')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {tier.gift_type === 'discount' && (() => {
            const originalPrice = selectedProduct?.price_gros || 0;
            const currentPercentage = tier.discount_percentage || 0;
            const salePrice = originalPrice > 0 && currentPercentage > 0
              ? originalPrice * (1 - currentPercentage / 100)
              : '';

            const handleDiscountSalePriceChange = (newSalePrice: string) => {
              if (!newSalePrice || !originalPrice) {
                onUpdate(tierIndex, { discount_percentage: null });
                return;
              }
              const salePriceNum = parseFloat(newSalePrice);
              const pct = ((originalPrice - salePriceNum) / originalPrice) * 100;
              onUpdate(tierIndex, { discount_percentage: pct > 0 ? Math.round(pct * 100) / 100 : 0 });
            };

            return (
              <div className="space-y-2">
                {originalPrice > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">السعر الأصلي:</span>
                    <Badge variant="outline">{originalPrice} DA</Badge>
                  </div>
                )}
                <Label className="text-xs text-muted-foreground">سعر البيع بعد التخفيض (DA)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={salePrice !== '' ? Math.round(Number(salePrice) * 100) / 100 : ''}
                    onChange={(e) => handleDiscountSalePriceChange(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    placeholder="سعر البيع..."
                  />
                  <span className="text-sm text-muted-foreground">DA</span>
                </div>
                {currentPercentage > 0 && originalPrice > 0 && (
                  <div className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-950/30 rounded p-1.5">
                    <span className="text-green-700 dark:text-green-400">قيمة التخفيض:</span>
                    <span className="font-medium text-green-700 dark:text-green-400">-{Math.round(originalPrice * currentPercentage / 100)} DA</span>
                  </div>
                )}
              </div>
            );
          })()}

          {tier.gift_type === 'price_discount' && (() => {
            const prices = {
              retail: selectedProduct?.price_retail || 0,
              gros: selectedProduct?.price_gros || 0,
              super_gros: selectedProduct?.price_super_gros || 0,
              invoice: selectedProduct?.price_invoice || 0,
            };
            const discountPrices = (tier.discount_prices || {}) as Record<string, number | null>;
            
            const priceTypes = [
              { key: 'retail', label: 'التجزئة' },
              { key: 'gros', label: 'الجملة (غرو)' },
              { key: 'super_gros', label: 'سبر غرو' },
              { key: 'invoice', label: 'فاتورة 1' },
            ];

            const handlePriceChange = (key: string, value: string) => {
              const newPrices = { ...discountPrices };
              if (!value) {
                newPrices[key] = null;
              } else {
                newPrices[key] = parseFloat(value);
              }
              onUpdate(tierIndex, { discount_prices: newPrices });
            };

            const handleApplyAll = () => {
              // Find first filled sale price and apply its discount ratio to all
              const firstFilledKey = priceTypes.find(pt => discountPrices[pt.key] != null && prices[pt.key as keyof typeof prices] > 0);
              if (firstFilledKey) {
                const origPrice = prices[firstFilledKey.key as keyof typeof prices];
                const salePrice = discountPrices[firstFilledKey.key]!;
                const ratio = salePrice / origPrice;
                const newPrices: Record<string, number> = {};
                priceTypes.forEach(pt => {
                  const orig = prices[pt.key as keyof typeof prices];
                  if (orig > 0) {
                    newPrices[pt.key] = Math.round(orig * ratio);
                  }
                });
                onUpdate(tierIndex, { discount_prices: newPrices });
              }
            };

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">أسعار البيع بعد التخفيض</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={handleApplyAll}
                  >
                    تطبيق على الكل
                  </Button>
                </div>
                
                <div className="space-y-1.5">
                  {priceTypes.map(pt => {
                    const origPrice = prices[pt.key as keyof typeof prices];
                    const salePrice = discountPrices[pt.key];
                    const discount = origPrice && salePrice != null ? origPrice - salePrice : 0;
                    
                    return (
                      <div key={pt.key} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0 text-end">{pt.label}</span>
                        {origPrice > 0 && (
                          <Badge variant="outline" className="text-[9px] h-5 shrink-0">{origPrice}</Badge>
                        )}
                        <Input
                          type="number"
                          min={0}
                          value={salePrice ?? ''}
                          onChange={(e) => handlePriceChange(pt.key, e.target.value)}
                          className="flex-1 h-7 text-xs"
                          placeholder={origPrice > 0 ? `${origPrice}` : '—'}
                        />
                        {discount > 0 && (
                          <span className="text-[9px] text-green-600 font-medium shrink-0">-{discount}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-accent/50 rounded p-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    ⬆️ الحد الأدنى للكمية محدد أعلاه — يتفعّل التخفيض عند بلوغ تلك الكمية
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    💡 أضف شرائح إضافية لتخفيضات تصاعدية حسب الكمية
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Worker Reward */}
        <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded space-y-2">
          <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
            <Users className="w-3 h-3" />
            {t('offers.worker_reward')}
          </div>
          
          <div className="flex gap-1">
            <Select
              value={tier.worker_reward_type}
              onValueChange={(value) => onUpdate(tierIndex, { worker_reward_type: value })}
            >
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('offers.no_reward')}</SelectItem>
                <SelectItem value="fixed">{t('offers.fixed_amount')}</SelectItem>
                <SelectItem value="percentage">{t('offers.percentage')}</SelectItem>
              </SelectContent>
            </Select>
            
            {tier.worker_reward_type !== 'none' && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  value={tier.worker_reward_amount}
                  onChange={(e) => onUpdate(tierIndex, { worker_reward_amount: parseFloat(e.target.value) || 0 })}
                  className="w-20 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  {tier.worker_reward_type === 'percentage' ? '%' : t('currency.dzd')}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OfferTierCard;
