import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Users, UserCheck } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('receivers');

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

  const addContact = useMutation({
    mutationFn: async (type: string) => {
      if (!newName.trim()) throw new Error('الاسم مطلوب');
      const { error } = await supabase.from('treasury_contacts').insert({
        branch_id: activeBranch?.id || null,
        contact_type: type,
        name: newName.trim(),
        created_by: workerId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName('');
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

  const receivers = (contacts || []).filter((c: any) => c.contact_type === 'receiver');
  const intermediaries = (contacts || []).filter((c: any) => c.contact_type === 'intermediary');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚙️ {t('treasury.settings_title') || 'إعدادات الخزينة'}</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} dir={dir}>
          <TabsList className="w-full">
            <TabsTrigger value="receivers" className="flex-1 gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              {t('treasury.receivers') || 'المستلمون'}
            </TabsTrigger>
            <TabsTrigger value="intermediaries" className="flex-1 gap-1">
              <Users className="w-3.5 h-3.5" />
              {t('treasury.intermediaries') || 'الوسطاء'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="receivers" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Input
                placeholder={t('treasury.receiver_name') || 'اسم المستلم'}
                value={activeTab === 'receivers' ? newName : ''}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addContact.mutate('receiver')}
              />
              <Button size="sm" onClick={() => addContact.mutate('receiver')} disabled={addContact.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {receivers.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm">{c.name}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteContact.mutate(c.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {receivers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('common.no_data') || 'لا توجد بيانات'}</p>}
            </div>
          </TabsContent>

          <TabsContent value="intermediaries" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Input
                placeholder={t('treasury.intermediary_name') || 'اسم الوسيط'}
                value={activeTab === 'intermediaries' ? newName : ''}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addContact.mutate('intermediary')}
              />
              <Button size="sm" onClick={() => addContact.mutate('intermediary')} disabled={addContact.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {intermediaries.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm">{c.name}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteContact.mutate(c.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {intermediaries.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('common.no_data') || 'لا توجد بيانات'}</p>}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TreasurySettingsDialog;
