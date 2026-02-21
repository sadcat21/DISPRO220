import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Worker, Branch } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Building2, Plus, Loader2, Trash2, Pencil, MapPin, User } from 'lucide-react';
import { toast } from 'sonner';
import { ALGERIAN_WILAYAS, DEFAULT_WILAYA } from '@/data/algerianWilayas';
import { useLanguage } from '@/contexts/LanguageContext';

interface BranchWithAdmin extends Branch {
  admin?: Worker;
}

const Branches: React.FC = () => {
  const { t } = useLanguage();
  const [branches, setBranches] = useState<BranchWithAdmin[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchWithAdmin | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<BranchWithAdmin | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [wilaya, setWilaya] = useState(DEFAULT_WILAYA);
  const [address, setAddress] = useState('');
  const [adminId, setAdminId] = useState<string>('none');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [branchesRes, workersRes] = await Promise.all([
        supabase.from('branches').select('*').order('created_at', { ascending: false }),
        supabase.from('workers_safe').select('*').eq('is_active', true).order('full_name')
      ]);

      if (branchesRes.error) throw branchesRes.error;
      if (workersRes.error) throw workersRes.error;

      // Map admin info to branches
      const branchesWithAdmin = (branchesRes.data || []).map(branch => ({
        ...branch,
        admin: workersRes.data?.find(w => w.id === branch.admin_id)
      }));

      setBranches(branchesWithAdmin);
      setWorkers(workersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('common.loading'));
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setWilaya(DEFAULT_WILAYA);
    setAddress('');
    setAdminId('none');
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error(t('branches.enter_name'));
      return;
    }

    setIsSaving(true);
    try {
      const { data: newBranch, error } = await supabase.from('branches').insert({
        name: name.trim(),
        wilaya: wilaya,
        address: address.trim() || null,
        admin_id: adminId && adminId !== 'none' ? adminId : null,
      }).select().single();

      if (error) throw error;

      // If admin is selected, update their branch_id to the new branch
      if (adminId && adminId !== 'none' && newBranch) {
        await supabase.from('workers').update({ branch_id: newBranch.id }).eq('id', adminId);
      }

      toast.success(t('common.add') + ' ✓');
      setShowAddDialog(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error adding branch:', error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingBranch || !name.trim()) {
      toast.error(t('branches.enter_name'));
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('branches')
        .update({
          name: name.trim(),
          wilaya: wilaya,
          address: address.trim() || null,
          admin_id: adminId && adminId !== 'none' ? adminId : null,
        })
        .eq('id', editingBranch.id);

      if (error) throw error;

      // Update admin's branch_id if changed
      if (adminId && adminId !== 'none') {
        await supabase.from('workers').update({ branch_id: editingBranch.id }).eq('id', adminId);
      }

      toast.success(t('common.save') + ' ✓');
      setShowEditDialog(false);
      setEditingBranch(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error updating branch:', error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDialog = (branch: BranchWithAdmin) => {
    setEditingBranch(branch);
    setName(branch.name);
    setWilaya(branch.wilaya);
    setAddress(branch.address || '');
    setAdminId(branch.admin_id || 'none');
    setShowEditDialog(true);
  };

  const toggleBranchStatus = async (branch: BranchWithAdmin) => {
    try {
      const { error } = await supabase
        .from('branches')
        .update({ is_active: !branch.is_active })
        .eq('id', branch.id);

      if (error) throw error;

      toast.success(branch.is_active ? t('branches.deactivated') : t('branches.activated'));
      fetchData();
    } catch (error) {
      console.error('Error toggling branch status:', error);
      toast.error(t('common.loading'));
    }
  };

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branchToDelete.id);

      if (error) throw error;

      toast.success(t('common.delete') + ' ✓');
      setBranchToDelete(null);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting branch:', error);
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('branches.title')}</h2>
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 ml-2" />
              {t('branches.add')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>{t('branches.add_new')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddBranch} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('branches.name')} *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('branches.enter_name')}
                  className="text-right"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>{t('customers.wilaya')}</Label>
                <Select value={wilaya} onValueChange={setWilaya}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('customers.select_wilaya')} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50 max-h-60">
                    {ALGERIAN_WILAYAS.map((w) => (
                      <SelectItem key={w.code} value={w.name}>
                        {w.code} - {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('common.address')}</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('common.address')}
                  className="text-right"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.admin')}</Label>
                <Select value={adminId} onValueChange={setAdminId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('branches.select_admin')} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50 max-h-60">
                    <SelectItem value="none">{t('branches.no_admin')}</SelectItem>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.full_name} (@{w.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('branches.add')
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <Card className="bg-secondary text-secondary-foreground">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('branches.total')}</p>
            <p className="text-xl font-bold">{branches.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Branches List */}
      <div className="space-y-3">
        {branches.map((branch) => (
          <Card key={branch.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mt-1">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">{branch.name}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin className="w-3 h-3" />
                      <span>{branch.wilaya}</span>
                    </div>
                    {branch.admin && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{t('workers.role_admin')}: {branch.admin.full_name}</span>
                      </div>
                    )}
                    {branch.address && (
                      <p className="text-xs text-muted-foreground mt-1">{branch.address}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${branch.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {branch.is_active ? t('common.active') : t('common.inactive')}
                  </span>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={branch.is_active}
                      onCheckedChange={() => toggleBranchStatus(branch)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => openEditDialog(branch)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setBranchToDelete(branch)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {branches.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('branches.no_branches')}</p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditingBranch(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{t('branches.edit')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditBranch} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('branches.name')} *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('branches.enter_name')}
                className="text-right"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>{t('customers.wilaya')}</Label>
              <Select value={wilaya} onValueChange={setWilaya}>
                <SelectTrigger>
                  <SelectValue placeholder={t('customers.select_wilaya')} />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 max-h-60">
                  {ALGERIAN_WILAYAS.map((w) => (
                    <SelectItem key={w.code} value={w.name}>
                      {w.code} - {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('common.address')}</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('common.address')}
                className="text-right"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('branches.admin')}</Label>
              <Select value={adminId} onValueChange={setAdminId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('branches.select_admin')} />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 max-h-60">
                  <SelectItem value="none">{t('branches.no_admin')}</SelectItem>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name} (@{w.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!branchToDelete} onOpenChange={(open) => !open && setBranchToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('customers.confirm_delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('branches.confirm_delete')} "{branchToDelete?.name}"؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBranch}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Branches;
