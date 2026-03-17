import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useExpenseCategories, useCreateExpense } from '@/hooks/useExpenses';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, X } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getCategoryName } from '@/utils/categoryName';
import { isAdminRole } from '@/lib/utils';

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddExpenseDialog: React.FC<AddExpenseDialogProps> = ({ open, onOpenChange }) => {
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const { language, t, dir } = useLanguage();
  const { role, activeRole } = useAuth();

  // Filter categories based on user's active role
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    // Admin always sees all categories
    if (isAdminRole(role)) return categories;
    
    const userRoleCode = activeRole?.custom_role_code;
    const userSystemRole = role; // 'branch_admin', 'supervisor', 'worker'
    
    return categories.filter(cat => {
      const visibleRoles = (cat as any).visible_to_roles as string[] | null;
      // NULL or empty = visible to all
      if (!visibleRoles || visibleRoles.length === 0) return true;
      // Check system role (branch_admin, supervisor)
      if (userSystemRole && visibleRoles.includes(userSystemRole)) return true;
      // Check functional role
      return userRoleCode ? visibleRoles.includes(userRoleCode) : false;
    });
  }, [categories, role, activeRole]);

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Check if selected category is fuel
  const selectedCategory = filteredCategories.find(c => c.id === categoryId);
  const isFuelCategory = selectedCategory?.name?.includes('وقود') || 
    selectedCategory?.name_fr?.toLowerCase().includes('carburant') || 
    selectedCategory?.name_en?.toLowerCase().includes('fuel');

  const resetForm = () => {
    setCategoryId('');
    setAmount('');
    setDescription('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setReceiptFiles([]);
    setPaymentMethod('cash');
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setReceiptFiles(prev => [...prev, ...Array.from(files)]);
  };

  const removeFile = (index: number) => {
    setReceiptFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amount || parseFloat(amount) <= 0) return;

    const receiptUrls: string[] = [];

    if (receiptFiles.length > 0) {
      setUploading(true);
      for (const file of receiptFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { data, error } = await supabase.storage
          .from('receipts')
          .upload(fileName, file);

        if (error) {
          console.error('Upload error:', error);
          continue;
        }
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(data.path);
        receiptUrls.push(urlData.publicUrl);
      }
      setUploading(false);
    }

    await createExpense.mutateAsync({
      category_id: categoryId,
      amount: parseFloat(amount),
      description: description || undefined,
      expense_date: expenseDate,
      receipt_url: receiptUrls[0],
      receipt_urls: receiptUrls,
      payment_method: isFuelCategory ? paymentMethod : 'cash',
    });

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t('expenses.add_expense')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('expenses.category')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder={t('expenses.select_category')} />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {getCategoryName(cat as any, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('expenses.amount')}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Fuel Payment Method */}
          {isFuelCategory && (
            <div className="space-y-2">
              <Label>{t('expenses.payment_method')}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('expenses.payment_cash')}</SelectItem>
                  <SelectItem value="card">{t('expenses.payment_card')}</SelectItem>
                </SelectContent>
              </Select>
              {paymentMethod === 'card' && (
                <p className="text-xs text-muted-foreground">{t('expenses.card_note')}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('expenses.date')}</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={e => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('expenses.description')}</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('expenses.description_placeholder')}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('expenses.receipts')}</Label>
            
            {/* Show selected files */}
            {receiptFiles.length > 0 && (
              <div className="space-y-1">
                {receiptFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            <label className="flex items-center gap-2 p-3 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('expenses.click_upload')}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </label>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!categoryId || !amount || createExpense.isPending || uploading}
          >
            {(createExpense.isPending || uploading) && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            {t('expenses.add_button')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddExpenseDialog;
