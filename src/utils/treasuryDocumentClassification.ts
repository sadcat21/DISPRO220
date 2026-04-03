export const getDocumentVerification = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
};

export const resolveReceiptBucket = (value: unknown): 'cash' | 'doc' => {
  const verification = getDocumentVerification(value);
  if (verification.manager_receipt_bucket === 'cash' || verification.manager_receipt_bucket === 'doc') {
    return verification.manager_receipt_bucket;
  }
  return verification.paid_by_cash === true ? 'cash' : 'doc';
};

export const isTransferPaidByCash = (value: unknown): boolean => {
  const verification = getDocumentVerification(value);
  return verification.paid_by_cash === true;
};
