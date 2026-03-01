
-- جدول إعدادات محرك المكافآت الذكي
CREATE TABLE public.reward_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  point_value numeric NOT NULL DEFAULT 10,
  monthly_budget numeric NOT NULL DEFAULT 0,
  auto_percentage numeric NOT NULL DEFAULT 70,
  competition_percentage numeric NOT NULL DEFAULT 20,
  reserve_percentage numeric NOT NULL DEFAULT 10,
  minimum_threshold numeric NOT NULL DEFAULT 40,
  top1_bonus_pct numeric NOT NULL DEFAULT 50,
  top2_bonus_pct numeric NOT NULL DEFAULT 30,
  top3_bonus_pct numeric NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.workers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id)
);

-- جدول صندوق الفائض المرحّل
CREATE TABLE public.reward_reserve_fund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  month date NOT NULL,
  carried_balance numeric NOT NULL DEFAULT 0,
  surplus_added numeric NOT NULL DEFAULT 0,
  used_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, month)
);

-- تفعيل RLS
ALTER TABLE public.reward_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_reserve_fund ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان
CREATE POLICY "Workers can view reward config" ON public.reward_config FOR SELECT USING (public.is_worker());
CREATE POLICY "Admins can manage reward config" ON public.reward_config FOR ALL USING (public.is_admin());

CREATE POLICY "Workers can view reserve fund" ON public.reward_reserve_fund FOR SELECT USING (public.is_worker());
CREATE POLICY "Admins can manage reserve fund" ON public.reward_reserve_fund FOR ALL USING (public.is_admin());

-- Trigger لتحديث updated_at
CREATE TRIGGER update_reward_config_updated_at BEFORE UPDATE ON public.reward_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reward_reserve_fund_updated_at BEFORE UPDATE ON public.reward_reserve_fund FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
