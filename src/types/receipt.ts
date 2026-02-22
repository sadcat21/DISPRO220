export type ReceiptType = 'direct_sale' | 'delivery' | 'debt_payment';

export interface ReceiptItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  giftQuantity?: number;
  giftPieces?: number;
  isPromo?: boolean;
  paymentType?: string;
  priceSubtype?: string;
  invoicePaymentMethod?: string;
  offerNote?: string; // note for managers when offer was overridden
}

export interface Receipt {
  id: string;
  receipt_number: number;
  receipt_type: ReceiptType;
  order_id: string | null;
  debt_id: string | null;
  customer_id: string;
  worker_id: string;
  branch_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  worker_name: string;
  worker_phone: string | null;
  items: ReceiptItem[];
  total_amount: number;
  discount_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_method: string | null;
  print_count: number;
  last_printed_at: string | null;
  is_modified: boolean;
  original_data: any | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptWithDetails extends Receipt {
  customer?: { id: string; name: string; phone: string | null; wilaya: string | null };
  worker?: { id: string; full_name: string; username: string };
}

export interface ReceiptModification {
  id: string;
  receipt_id: string;
  modified_by: string;
  modification_type: string;
  original_data: any;
  modified_data: any;
  changes_summary: string | null;
  is_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReceiptModificationWithDetails extends ReceiptModification {
  modifier?: { id: string; full_name: string };
  receipt?: Receipt;
}

export type PrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error';
