import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Gift, Calendar, Layers, ChevronDown, ChevronUp, Plus, Package } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Product, Branch } from '@/types/database';
import { ProductOffer, ProductOfferTier, ProductOfferWithDetails } from '@/types/productOffer';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import OfferTierCard from './OfferTierCard';

interface CreateOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editOffer?: ProductOfferWithDetails | null;
}

const defaultTier: Omit<ProductOfferTier, 'id' | 'offer_id' | 'created_at'> = {
  min_quantity: 1,
  max_quantity: null,
  min_quantity_unit: 'piece',
  gift_quantity: 1,
  gift_quantity_unit: 'piece',
  gift_type: 'same_product',
  gift_product_id: null,
  discount_percentage: null,
  discount_amount: null,
  worker_reward_type: 'none',
  worker_reward_amount: 0,
  tier_order: 0,
};

const CreateOfferDialog: React.FC<CreateOfferDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  editOffer,
}) => {
  const { t, dir } = useLanguage();
  const { workerId, role } = useAuth();
  const isAdmin = role === 'admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tiers');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state - offer level
  const [formData, setFormData] = useState({
    product_id: '',
    name: '',
    description: '',
    condition_type: 'range' as 'range' | 'multiplier',
    is_stackable: false,
    is_auto_apply: true,
    start_date: '',
    end_date: '',
    is_active: true,
    priority: 0,
    branch_id: null as string | null,
  });

  // Tiers state
  const [tiers, setTiers] = useState<ProductOfferTier[]>([{ ...defaultTier, tier_order: 0 }]);

  // Load edit offer data after products are loaded
  const loadEditOfferData = () => {
    if (editOffer) {
      setFormData({
        product_id: editOffer.product_id,
        name: editOffer.name,
        description: editOffer.description || '',
        condition_type: (editOffer.condition_type as 'range' | 'multiplier') || 'range',
        is_stackable: editOffer.is_stackable,
        is_auto_apply: editOffer.is_auto_apply,
        start_date: editOffer.start_date || '',
        end_date: editOffer.end_date || '',
        is_active: editOffer.is_active,
        priority: editOffer.priority,
        branch_id: editOffer.branch_id,
      });
      
      // Load existing tiers or use legacy single tier
      if (editOffer.tiers && editOffer.tiers.length > 0) {
        setTiers(editOffer.tiers.map((tier, index) => ({
          ...tier,
          tier_order: index,
        })));
      } else {
        // Legacy: convert old single-tier data
        setTiers([{
          min_quantity: editOffer.min_quantity,
          max_quantity: editOffer.max_quantity,
          min_quantity_unit: editOffer.min_quantity_unit || 'piece',
          gift_quantity: editOffer.gift_quantity,
          gift_quantity_unit: editOffer.gift_quantity_unit || 'piece',
          gift_type: editOffer.gift_type,
          gift_product_id: editOffer.gift_product_id,
          discount_percentage: editOffer.discount_percentage,
          discount_amount: editOffer.discount_amount,
          worker_reward_type: editOffer.worker_reward_type,
          worker_reward_amount: editOffer.worker_reward_amount,
          tier_order: 0,
        }]);
      }
    }
  };

  useEffect(() => {
    if (open) {
      const loadData = async () => {
        await fetchProducts();
        if (isAdmin) await fetchBranches();
        
        if (editOffer) {
          loadEditOfferData();
        } else {
          resetForm();
        }
      };
      loadData();
    }
  }, [open, editOffer]);

  const resetForm = () => {
    setFormData({
      product_id: '',
      name: '',
      description: '',
      condition_type: 'range',
      is_stackable: false,
      is_auto_apply: true,
      start_date: '',
      end_date: '',
      is_active: true,
      priority: 0,
      branch_id: null,
    });
    setTiers([{ ...defaultTier, tier_order: 0 }]);
    setActiveTab('tiers');
    setShowAdvanced(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setProducts(data || []);
  };

  const fetchBranches = async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setBranches(data || []);
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product?.name || '';
  };

  const getFinalOfferName = () => {
    if (formData.name.trim()) {
      return formData.name.trim();
    }
    return `${t('offers.offer_on')} ${getProductName(formData.product_id)}`;
  };

  // Tier management
  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newTier: ProductOfferTier = {
      ...defaultTier,
      min_quantity: (lastTier?.max_quantity || lastTier?.min_quantity || 0) + 1,
      tier_order: tiers.length,
    };
    setTiers([...tiers, newTier]);
  };

  const updateTier = (index: number, updates: Partial<ProductOfferTier>) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], ...updates };
    setTiers(newTiers);
  };

  const deleteTier = (index: number) => {
    if (tiers.length <= 1) return;
    const newTiers = tiers.filter((_, i) => i !== index).map((tier, i) => ({
      ...tier,
      tier_order: i,
    }));
    setTiers(newTiers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_id) {
      toast.error(t('offers.select_product'));
      return;
    }

    if (tiers.length === 0) {
      toast.error(t('offers.add_tier'));
      return;
    }

    setIsLoading(true);
    try {
      // First tier data for legacy compatibility
      const firstTier = tiers[0];
      
      const offerData = {
        product_id: formData.product_id,
        name: getFinalOfferName(),
        description: formData.description.trim() || null,
        condition_type: formData.condition_type,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        is_stackable: formData.is_stackable,
        is_auto_apply: formData.is_auto_apply,
        is_active: formData.is_active,
        priority: formData.priority,
        branch_id: formData.branch_id,
        // Legacy fields from first tier
        min_quantity: firstTier.min_quantity,
        max_quantity: firstTier.max_quantity,
        min_quantity_unit: firstTier.min_quantity_unit,
        gift_quantity: firstTier.gift_quantity,
        gift_quantity_unit: firstTier.gift_quantity_unit,
        gift_type: firstTier.gift_type,
        gift_product_id: firstTier.gift_product_id,
        discount_percentage: firstTier.discount_percentage,
        discount_amount: firstTier.discount_amount,
        worker_reward_type: firstTier.worker_reward_type,
        worker_reward_amount: firstTier.worker_reward_amount,
      };

      let offerId: string;

      if (editOffer) {
        const { error } = await supabase
          .from('product_offers')
          .update(offerData)
          .eq('id', editOffer.id);
        if (error) throw error;
        offerId = editOffer.id;

        // Delete old tiers
        await supabase
          .from('product_offer_tiers')
          .delete()
          .eq('offer_id', offerId);
      } else {
        const { data, error } = await supabase
          .from('product_offers')
          .insert({ ...offerData, created_by: workerId })
          .select('id')
          .single();
        if (error) throw error;
        offerId = data.id;
      }

      // Insert all tiers
      if (tiers.length > 0) {
        const tiersData = tiers.map((tier, index) => ({
          offer_id: offerId,
          min_quantity: tier.min_quantity,
          max_quantity: tier.max_quantity,
          min_quantity_unit: tier.min_quantity_unit,
          gift_quantity: tier.gift_quantity,
          gift_quantity_unit: tier.gift_quantity_unit,
          gift_type: tier.gift_type,
          gift_product_id: tier.gift_product_id,
          discount_percentage: tier.discount_percentage,
          discount_amount: tier.discount_amount,
          worker_reward_type: tier.worker_reward_type,
          worker_reward_amount: tier.worker_reward_amount,
          tier_order: index,
        }));

        const { error: tiersError } = await supabase
          .from('product_offer_tiers')
          .insert(tiersData);
        if (tiersError) throw tiersError;
      }

      toast.success(editOffer ? t('offers.updated') : t('offers.created'));
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving offer:', error);
      toast.error(error.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0" dir={dir}>
        <DialogHeader className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 rounded-t-lg">
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            {editOffer ? t('offers.edit') : t('offers.create')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-2 mx-4 mt-2" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="tiers" className="text-xs">
                <Layers className="w-3 h-3 me-1" />
                {t('offers.tiers')} ({tiers.length})
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-xs">
                <Calendar className="w-3 h-3 me-1" />
                {t('offers.settings')}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[450px] px-4 py-2">
              {/* Tiers Tab */}
              <TabsContent value="tiers" className="space-y-4 mt-0">
                {/* Product Selection */}
                <div className="space-y-2">
                  <Label>{t('offers.product')} *</Label>
                  <Select
                    value={formData.product_id}
                    onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('offers.select_product')} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            {product.name}
                            <span className="text-xs text-muted-foreground">
                              ({product.pieces_per_box} {t('offers.unit_piece_short')}/{t('offers.unit_box_short')})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Condition Type Selection */}
                <div className="space-y-2">
                  <Label>{t('offers.condition_type')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={formData.condition_type === 'range' ? 'default' : 'outline'}
                      className="h-auto py-3 flex flex-col items-center gap-1"
                      onClick={() => setFormData({ ...formData, condition_type: 'range' })}
                    >
                      <span className="font-medium">{t('offers.range')}</span>
                      <span className="text-xs opacity-70">{t('offers.range_hint')}</span>
                    </Button>
                    <Button
                      type="button"
                      variant={formData.condition_type === 'multiplier' ? 'default' : 'outline'}
                      className="h-auto py-3 flex flex-col items-center gap-1"
                      onClick={() => setFormData({ ...formData, condition_type: 'multiplier' })}
                    >
                      <span className="font-medium">{t('offers.multiplier')}</span>
                      <span className="text-xs opacity-70">{t('offers.multiplier_hint')}</span>
                    </Button>
                  </div>
                </div>

                {/* Tiers List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{t('offers.quantity_tiers')}</Label>
                    <Badge variant="secondary">{tiers.length} {t('offers.tier')}</Badge>
                  </div>

                  {tiers.map((tier, index) => (
                    <OfferTierCard
                      key={index}
                      tier={tier}
                      tierIndex={index}
                      products={products}
                      selectedProduct={products.find(p => p.id === formData.product_id) || null}
                      onUpdate={updateTier}
                      onDelete={deleteTier}
                      canDelete={tiers.length > 1}
                      conditionType={formData.condition_type}
                    />
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed"
                    onClick={addTier}
                  >
                    <Plus className="w-4 h-4 me-2" />
                    {t('offers.add_tier')}
                  </Button>
                </div>

                {/* Advanced Options */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="text-xs text-muted-foreground">{t('offers.advanced_options')}</span>
                      {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">{t('offers.custom_name')}</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={formData.product_id ? getProductName(formData.product_id) : t('offers.name_placeholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">{t('offers.description')}</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('offers.description_placeholder')}
                        rows={2}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {t('offers.start_date')}
                    </Label>
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {t('offers.end_date')}
                    </Label>
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('offers.priority')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">{t('offers.priority_hint')}</p>
                </div>

                {isAdmin && branches.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t('offers.branch')}</Label>
                    <Select
                      value={formData.branch_id || 'all'}
                      onValueChange={(value) => setFormData({ ...formData, branch_id: value === 'all' ? null : value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('offers.all_branches')}</SelectItem>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('offers.is_stackable')}</Label>
                      <p className="text-xs text-muted-foreground">{t('offers.stackable_hint')}</p>
                    </div>
                    <Switch
                      checked={formData.is_stackable}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_stackable: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('offers.is_auto_apply')}</Label>
                      <p className="text-xs text-muted-foreground">{t('offers.auto_apply_hint')}</p>
                    </div>
                    <Switch
                      checked={formData.is_auto_apply}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_auto_apply: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('offers.is_active')}</Label>
                    </div>
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <div className="p-4 border-t">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 me-2" />
                  {editOffer ? t('common.save') : t('offers.create')}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateOfferDialog;
