
-- إضافة عمود الأدوار المستهدفة للمهام والمخالفات
ALTER TABLE public.reward_tasks ADD COLUMN IF NOT EXISTS applicable_roles text[] DEFAULT NULL;
ALTER TABLE public.reward_penalties ADD COLUMN IF NOT EXISTS applicable_roles text[] DEFAULT NULL;

COMMENT ON COLUMN public.reward_tasks.applicable_roles IS 'الأدوار المستهدفة: worker, admin, supervisor, branch_admin. NULL = الكل';
COMMENT ON COLUMN public.reward_penalties.applicable_roles IS 'الأدوار المستهدفة: worker, admin, supervisor, branch_admin. NULL = الكل';

-- تحديث المهام الحالية لتكون خاصة بالعمال (مندوبي المبيعات/التوصيل)
UPDATE public.reward_tasks SET applicable_roles = ARRAY['worker'] WHERE data_source IN ('sales', 'visits', 'collections', 'new_customers');

-- تحديث المخالفات الحالية لتكون خاصة بالعمال
UPDATE public.reward_penalties SET applicable_roles = ARRAY['worker'] 
WHERE trigger_event IN ('cancel_visit', 'missing_delivery', 'product_return', 'unauthorized_discount', 'wrong_invoice', 
  'debt_overdue', 'document_missing', 'late_arrival', 'early_leave', 'gps_deviation', 'absence',
  'unsafe_driving', 'truck_damage', 'cash_discrepancy', 'stock_shortage');

-- المخالفات العامة تبقى NULL (تطبق على الجميع)
UPDATE public.reward_penalties SET applicable_roles = NULL 
WHERE trigger_event IN ('phone_unreachable', 'policy_violation', 'confirmed_complaint', 'customer_loss');

-- =============================================
-- مهام مكافآت خاصة بمسؤول المخزن (warehouse)
-- =============================================
INSERT INTO public.reward_tasks (name, category, data_source, condition_logic, reward_points, penalty_points, frequency, is_cumulative, is_active, applicable_roles) VALUES
('تحميل 5 شاحنات يومياً', 'discipline', 'visits', '{"min_count": 5}', 8, 0, 'daily', false, true, ARRAY['branch_admin']),
('دقة جرد المخزون 100%', 'discipline', 'visits', '{"min_count": 1}', 15, 0, 'daily', false, true, ARRAY['branch_admin']),
('استلام طلبية مصنع بدون أخطاء', 'quality', 'visits', '{"min_count": 1}', 5, 0, 'daily', false, true, ARRAY['branch_admin']),
('تنظيم المستودع أسبوعياً', 'discipline', 'visits', '{"min_count": 1}', 10, 0, 'weekly', false, true, ARRAY['branch_admin']);

-- =============================================
-- مهام مكافآت خاصة بمدير الفرع
-- =============================================
INSERT INTO public.reward_tasks (name, category, data_source, condition_logic, reward_points, penalty_points, frequency, is_cumulative, is_active, applicable_roles) VALUES
('تسليم الخزينة في الوقت المحدد', 'discipline', 'visits', '{"min_count": 1}', 5, 0, 'daily', false, true, ARRAY['admin']),
('إتمام جميع جلسات المحاسبة', 'discipline', 'visits', '{"min_count": 1}', 10, 0, 'daily', false, true, ARRAY['admin']),
('مراجعة تقارير الأداء الأسبوعية', 'quality', 'visits', '{"min_count": 1}', 8, 0, 'weekly', false, true, ARRAY['admin']),
('حل شكاوى العملاء خلال 24 ساعة', 'quality', 'visits', '{"min_count": 1}', 10, 0, 'daily', false, true, ARRAY['admin']),
('تحقيق هدف مبيعات الفرع الشهري', 'sales', 'sales', '{"min_amount": 500000}', 50, 0, 'monthly', false, true, ARRAY['admin']);

-- =============================================
-- مهام مكافآت خاصة بالمشرف
-- =============================================
INSERT INTO public.reward_tasks (name, category, data_source, condition_logic, reward_points, penalty_points, frequency, is_cumulative, is_active, applicable_roles) VALUES
('متابعة 5 عمال يومياً', 'discipline', 'visits', '{"min_count": 5}', 8, 0, 'daily', false, true, ARRAY['supervisor']),
('مراجعة تحصيلات العمال', 'collection', 'collections', '{"min_count": 3}', 5, 0, 'daily', false, true, ARRAY['supervisor']),
('تدريب عامل جديد', 'quality', 'visits', '{"min_count": 1}', 15, 0, 'weekly', false, true, ARRAY['supervisor']),
('تقرير ميداني يومي', 'discipline', 'visits', '{"min_count": 1}', 5, 0, 'daily', false, true, ARRAY['supervisor']),
('زيارة عملاء VIP أسبوعياً', 'quality', 'visits', '{"min_count": 3}', 10, 0, 'weekly', false, true, ARRAY['supervisor']);

-- =============================================
-- مخالفات خاصة بمسؤول المخزن
-- =============================================
INSERT INTO public.reward_penalties (name, penalty_points, trigger_event, is_automatic, is_active, applicable_roles) VALUES
('خطأ في تحميل الشاحنة', 5, 'stock_shortage', false, true, ARRAY['branch_admin']),
('تأخير تحميل الشاحنات', 3, 'late_arrival', false, true, ARRAY['branch_admin']),
('عدم تسجيل استلام بضاعة', 7, 'stock_shortage', false, true, ARRAY['branch_admin']),
('فقدان بضاعة من المستودع', 15, 'stock_shortage', false, true, ARRAY['branch_admin']),
('إهمال في ترتيب المخزون', 3, 'policy_violation', false, true, ARRAY['branch_admin']);

-- =============================================
-- مخالفات خاصة بمدير الفرع
-- =============================================
INSERT INTO public.reward_penalties (name, penalty_points, trigger_event, is_automatic, is_active, applicable_roles) VALUES
('تأخير تسليم الخزينة', 5, 'late_arrival', false, true, ARRAY['admin']),
('عدم إتمام جلسة المحاسبة', 8, 'policy_violation', false, true, ARRAY['admin']),
('تجاهل شكوى عميل', 10, 'confirmed_complaint', false, true, ARRAY['admin']),
('خطأ في تقرير مالي', 7, 'cash_discrepancy', false, true, ARRAY['admin']),
('عدم متابعة أداء العمال', 5, 'policy_violation', false, true, ARRAY['admin']);

-- =============================================
-- مخالفات خاصة بالمشرف
-- =============================================
INSERT INTO public.reward_penalties (name, penalty_points, trigger_event, is_automatic, is_active, applicable_roles) VALUES
('عدم متابعة العمال في الميدان', 5, 'policy_violation', false, true, ARRAY['supervisor']),
('تقرير ميداني ناقص', 3, 'policy_violation', false, true, ARRAY['supervisor']),
('عدم حل مشكلة عامل', 5, 'policy_violation', false, true, ARRAY['supervisor']),
('تأخير رفع التقارير', 3, 'late_arrival', false, true, ARRAY['supervisor']),
('إهمال تدريب العمال الجدد', 7, 'policy_violation', false, true, ARRAY['supervisor']);
