export type UnitType = 'box' | 'piece';

export interface ProductOfferTier {
  id?: string;
  offer_id?: string;
  min_quantity: number;
  max_quantity: number | null;
  min_quantity_unit: string;
  gift_quantity: number;
  gift_quantity_unit: string;
  gift_type: string;
  gift_product_id: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  worker_reward_type: string;
  worker_reward_amount: number;
  tier_order: number;
  created_at?: string;
}

export type ConditionType = 'range' | 'multiplier';

export interface ProductOffer {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  condition_type: string; // 'range' | 'multiplier'
  
  // Quantity conditions (for legacy/single tier offers)
  min_quantity: number;
  max_quantity: number | null;
  min_quantity_unit: string; // 'box' | 'piece'
  
  // Customer reward
  gift_quantity: number;
  gift_quantity_unit: string; // 'box' | 'piece'
  gift_type: string;
  gift_product_id: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  
  // Worker reward
  worker_reward_type: string;
  worker_reward_amount: number;
  
  // Offer behavior
  is_stackable: boolean;
  is_auto_apply: boolean;
  
  // Time conditions
  start_date: string | null;
  end_date: string | null;
  
  // Status
  is_active: boolean;
  priority: number;
  
  // Branch scope
  branch_id: string | null;
  
  // Audit
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductOfferWithDetails extends ProductOffer {
  product?: {
    id: string;
    name: string;
  };
  gift_product?: {
    id: string;
    name: string;
  } | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  tiers?: ProductOfferTierWithDetails[];
}

export interface ProductOfferTierWithDetails extends ProductOfferTier {
  gift_product?: {
    id: string;
    name: string;
  } | null;
}
