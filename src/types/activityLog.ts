import { Worker } from './database';

export interface ActivityLog {
  id: string;
  worker_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any> | null;
  branch_id: string | null;
  created_at: string;
}

export interface ActivityLogWithWorker extends ActivityLog {
  worker?: Worker;
}

export const ACTION_TYPES: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  assign: 'تعيين',
  status_change: 'تغيير حالة',
};

export const ENTITY_TYPES: Record<string, string> = {
  promo: 'عملية برومو',
  order: 'طلبية',
  customer: 'عميل',
  product: 'منتج',
  worker: 'عامل',
  branch: 'فرع',
  role: 'دور',
  permission: 'صلاحية',
};
