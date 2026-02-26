import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Users, UserCheck, Phone, Pencil, Check, X, Landmark, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TreasurySettingsDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { t, dir } = useLanguage();
  const { workerId, activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [activeTab, setActiveTab] = useState('receivers');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Bank account form
  const [newBankName, setNewBankName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newAccountHolder, setNewAccountHolder] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editAccountHolder, setEditAccountHolder] = useState('');

  const { data: contacts } = useQuery({
    queryKey: ['treasury-contacts', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('treasury_contacts').select('*').eq('is_active', true).order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ['treasury-bank-accounts', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('treasury_bank_accounts').select('*').eq('is_active', true).order('bank_name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const addContact = useMutation({
    mutationFn: async (type: string) => {
      if (!newName.trim()) throw new Error(t('treasury.name_required'));
      const { error } = await supabase.from('treasury_contacts').insert({
        branch_id: activeBranch?.id || null,
        contact_type: type,
        name: newName.trim(),
        phone: newPhone.trim() || null,
        created_by: workerId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName(''); setNewPhone('');
      queryClient.invalidateQueries({ queryKey: ['treasury-contacts'] });
      toast.success(t('common.saved'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateContact = useMutation({
    mutationFn: async (id: string) => {
      if (!editName.trim()) throw new Error(t('treasury.name_required'));
      const { error } = await supabase.from('treasury_contacts').update({
        name: editName.trim(),
        phone: editPhone.trim() || null,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['treasury-contacts'] });
      toast.success(t('common.saved'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('treasury_contacts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-contacts'] });
      toast.success(t('common.deleted'));
    },
  });

  // Bank account mutations
  const addBankAccount = useMutation({
    mutationFn: async () => {
      if (!newBankName.trim() || !newAccountNumber.trim() || !newAccountHolder.trim()) {
        throw new Error(t('common.required'));
      }
      const { error } = await supabase.from('treasury_bank_accounts').insert({
        branch_id: activeBranch?.id || null,
        bank_name: newBankName.trim(),
        account_number: newAccountNumber.trim(),
        account_holder: newAccountHolder.trim(),
        created_by: workerId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewBankName(''); setNewAccountNumber(''); setNewAccountHolder('');
      queryClient.invalidateQueries({ queryKey: ['treasury-bank-accounts'] });
      toast.success(t('common.saved'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateBankAccount = useMutation({
    mutationFn: async (id: string) => {
      if (!editBankName.trim() || !editAccountNumber.trim() || !editAccountHolder.trim()) {
        throw new Error(t('common.required'));
      }
      const { error } = await supabase.from('treasury_bank_accounts').update({
        bank_name: editBankName.trim(),
        account_number: editAccountNumber.trim(),
        account_holder: editAccountHolder.trim(),
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['treasury-bank-accounts'] });
      toast.success(t('common.saved'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteBankAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('treasury_bank_accounts').update({ is_active: false } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-bank-accounts'] });
      toast.success(t('common.deleted'));
    },
  });

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditName(c.name || '');
    setEditPhone(c.phone || '');
  };

  const startEditBank = (b: any) => {
    setEditingId(b.id);
    setEditBankName(b.bank_name || '');
    setEditAccountNumber(b.account_number || '');
    setEditAccountHolder(b.account_holder || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName(''); setEditPhone('');
    setEditBankName(''); setEditAccountNumber(''); setEditAccountHolder('');
  };

  const receivers = (contacts || []).filter((c: any) => c.contact_type === 'receiver');
  const intermediaries = (contacts || []).filter((c: any) => c.contact_type === 'intermediary');

  const renderAddForm = (type: string, placeholder: string) => (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Input placeholder={placeholder} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addContact.mutate(type)} />
          <p className="text-[10px] text-muted-foreground px-1">💡 {t('treasury.name_fr_hint')}</p>
        </div>
        <Button size="sm" onClick={() => addContact.mutate(type)} disabled={addContact.isPending} className="self-start"><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="flex gap-2 items-center">
        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Input placeholder={t('treasury.phone')} value={newPhone} onChange={e => setNewPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addContact.mutate(type)} type="tel" dir="ltr" />
      </div>
    </div>
  );

  const renderContactList = (list: any[]) => (
    <div className="space-y-1.5">
      {list.map((c: any) => (
        <div key={c.id} className="bg-muted/50 rounded-lg px-3 py-2">
          {editingId === c.id ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateContact.mutate(c.id)} className="h-8 text-sm" autoFocus />
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary" onClick={() => updateContact.mutate(c.id)}><Check className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
              </div>
              <div className="flex gap-2 items-center">
                <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateContact.mutate(c.id)} type="tel" dir="ltr" className="h-8 text-sm" placeholder={t('treasury.phone')} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">{c.name}</span>
                {c.phone && <span className="text-[11px] text-muted-foreground flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" /> {c.phone}</span>}
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteContact.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          )}
        </div>
      ))}
      {list.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('common.no_data')}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚙️ {t('treasury.settings_title')}</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setNewName(''); setNewPhone(''); cancelEdit(); setNewBankName(''); setNewAccountNumber(''); setNewAccountHolder(''); }} dir={dir}>
          <TabsList className="w-full">
            <TabsTrigger value="receivers" className="flex-1 gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              {t('treasury.receivers')}
            </TabsTrigger>
            <TabsTrigger value="intermediaries" className="flex-1 gap-1">
              <Users className="w-3.5 h-3.5" />
              {t('treasury.intermediaries')}
            </TabsTrigger>
            <TabsTrigger value="bank_accounts" className="flex-1 gap-1">
              <Landmark className="w-3.5 h-3.5" />
              {t('treasury.bank_accounts')}
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex-1 gap-1">
              <MessageCircle className="w-3.5 h-3.5" />
              واتساب
            </TabsTrigger>
          </TabsList>

          <TabsContent value="receivers" className="space-y-3 mt-3">
            {renderAddForm('receiver', t('treasury.receiver_name'))}
            {renderContactList(receivers)}
          </TabsContent>

          <TabsContent value="intermediaries" className="space-y-3 mt-3">
            {renderAddForm('intermediary', t('treasury.intermediary_name'))}
            {renderContactList(intermediaries)}
          </TabsContent>

          <TabsContent value="bank_accounts" className="space-y-3 mt-3">
            {/* Add bank account form */}
            <div className="space-y-2 p-3 border border-dashed rounded-lg">
              <Input placeholder={t('treasury.bank_name')} value={newBankName} onChange={e => setNewBankName(e.target.value)} />
              <Input placeholder={t('treasury.account_number')} value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} dir="ltr" />
              <Input placeholder={t('treasury.account_holder')} value={newAccountHolder} onChange={e => setNewAccountHolder(e.target.value)} />
              <Button size="sm" onClick={() => addBankAccount.mutate()} disabled={addBankAccount.isPending} className="w-full gap-1">
                <Plus className="w-4 h-4" /> {t('common.add')}
              </Button>
            </div>

            {/* Bank accounts list */}
            <div className="space-y-1.5">
              {(bankAccounts || []).map((b: any) => (
                <div key={b.id} className="bg-muted/50 rounded-lg px-3 py-2">
                  {editingId === b.id ? (
                    <div className="space-y-2">
                      <Input value={editBankName} onChange={e => setEditBankName(e.target.value)} className="h-8 text-sm" placeholder={t('treasury.bank_name')} autoFocus />
                      <Input value={editAccountNumber} onChange={e => setEditAccountNumber(e.target.value)} className="h-8 text-sm" dir="ltr" placeholder={t('treasury.account_number')} />
                      <Input value={editAccountHolder} onChange={e => setEditAccountHolder(e.target.value)} className="h-8 text-sm" placeholder={t('treasury.account_holder')} />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="h-8 px-3 text-primary" onClick={() => updateBankAccount.mutate(b.id)}><Check className="w-4 h-4 mx-1" /> {t('common.save')}</Button>
                        <Button size="sm" variant="ghost" className="h-8 px-3" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block">🏦 {b.bank_name}</span>
                        <span className="text-[11px] text-muted-foreground block" dir="ltr">{b.account_number}</span>
                        <span className="text-[11px] text-muted-foreground block">{b.account_holder}</span>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditBank(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteBankAccount.mutate(b.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {(bankAccounts || []).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('common.no_data')}</p>}
            </div>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-3 mt-3">
            {renderAddForm('whatsapp', 'اسم جهة الاتصال')}
            {renderContactList((contacts || []).filter((c: any) => c.contact_type === 'whatsapp'))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TreasurySettingsDialog;
