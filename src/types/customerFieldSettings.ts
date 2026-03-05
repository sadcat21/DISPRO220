export type CustomerFieldKey =
  | 'name'
  | 'name_fr'
  | 'phone'
  | 'store_name'
  | 'customer_type'
  | 'internal_name'
  | 'sales_rep_name'
  | 'sector_id'
  | 'zone_id'
  | 'address'
  | 'wilaya'
  | 'location'
  | 'default_delivery_worker_id';

export interface CustomerFieldSettings {
  editableByWorkers: CustomerFieldKey[];
  completionFields: CustomerFieldKey[];
  requiredOnEdit: CustomerFieldKey[];
  requiredOnCreate: CustomerFieldKey[];
}

export const CUSTOMER_FIELD_LABELS: Record<CustomerFieldKey, string> = {
  name: 'اسم العميل',
  name_fr: 'اسم العميل بالفرنسية',
  phone: 'الهاتف',
  store_name: 'اسم المحل',
  customer_type: 'نوع العميل',
  internal_name: 'الاسم الداخلي',
  sales_rep_name: 'مسؤول المبيعات/المشتريات',
  sector_id: 'السكتور',
  zone_id: 'المنطقة داخل السكتور',
  address: 'العنوان',
  wilaya: 'الولاية',
  location: 'الموقع الجغرافي (GPS)',
  default_delivery_worker_id: 'عامل التوصيل الافتراضي',
};

export const CUSTOMER_FIELD_OPTIONS: Array<{ key: CustomerFieldKey; label: string }> =
  (Object.keys(CUSTOMER_FIELD_LABELS) as CustomerFieldKey[]).map((key) => ({
    key,
    label: CUSTOMER_FIELD_LABELS[key],
  }));

export const DEFAULT_CUSTOMER_FIELD_SETTINGS: CustomerFieldSettings = {
  editableByWorkers: CUSTOMER_FIELD_OPTIONS.map((item) => item.key),
  completionFields: [
    'name',
    'phone',
    'store_name',
    'sector_id',
    'location',
    'address',
    'wilaya',
    'name_fr',
    'internal_name',
    'sales_rep_name',
    'zone_id',
  ],
  requiredOnEdit: ['name'],
  requiredOnCreate: ['name', 'phone', 'store_name', 'sector_id', 'location'],
};

const isCustomerFieldKey = (value: string): value is CustomerFieldKey =>
  value in CUSTOMER_FIELD_LABELS;

const sanitizeKeys = (value: unknown, fallback: CustomerFieldKey[]): CustomerFieldKey[] => {
  if (!Array.isArray(value)) return [...fallback];
  const unique = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .filter(isCustomerFieldKey),
    ),
  );

  return unique.length > 0 ? unique : [...fallback];
};

export const normalizeCustomerFieldSettings = (value: unknown): CustomerFieldSettings => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CUSTOMER_FIELD_SETTINGS };

  const source = value as Partial<CustomerFieldSettings>;

  return {
    editableByWorkers: sanitizeKeys(source.editableByWorkers, DEFAULT_CUSTOMER_FIELD_SETTINGS.editableByWorkers),
    completionFields: sanitizeKeys(source.completionFields, DEFAULT_CUSTOMER_FIELD_SETTINGS.completionFields),
    requiredOnEdit: sanitizeKeys(source.requiredOnEdit, DEFAULT_CUSTOMER_FIELD_SETTINGS.requiredOnEdit),
    requiredOnCreate: sanitizeKeys(source.requiredOnCreate, DEFAULT_CUSTOMER_FIELD_SETTINGS.requiredOnCreate),
  };
};
