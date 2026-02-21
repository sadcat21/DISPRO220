export type CustomerAccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface CustomerAccount {
  id: string;
  customer_id: string | null;
  username: string;
  full_name: string;
  phone: string;
  store_name: string;
  business_type: string | null;
  wilaya: string | null;
  address: string | null;
  status: CustomerAccountStatus;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ACCOUNT_STATUS_LABELS: Record<CustomerAccountStatus, string> = {
  pending: 'قيد الانتظار',
  approved: 'مفعّل',
  rejected: 'مرفوض',
  suspended: 'موقوف',
};

export const ACCOUNT_STATUS_COLORS: Record<CustomerAccountStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
};
