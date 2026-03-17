import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Worker, Branch, AppRole } from '@/types/database';
import { CustomRole } from '@/types/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserPlus, Users, Loader2, Eye, EyeOff, Shield, Building2, Plus, X, Briefcase, Trash2, FlaskConical } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TestWorkersTab from '@/components/workers/TestWorkersTab';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { isAdminRole } from '@/lib/utils';

interface WorkerRoleEntry {
  id?: string;
  role: AppRole;
  branch_id: string | null;
  branch_name?: string | null;
  custom_role_ids: string[]; // تغيير من custom_role_id إلى مصفوفة
  custom_role_names?: string[];
}

interface WorkerWithRoles extends Worker {
  worker_roles: WorkerRoleEntry[];
}

const Workers: React.FC = () => {
  const { t } = useLanguage();
  const { activeBranch, role } = useAuth();
  const [workers, setWorkers] = useState<WorkerWithRoles[]>([]);
  const [deleteWorker, setDeleteWorker] = useState<WorkerWithRoles | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRolesDialog, setShowRolesDialog] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerWithRoles | null>(null);
  
  // Form state
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [workerRoles, setWorkerRoles] = useState<WorkerRoleEntry[]>([{ role: 'worker', branch_id: null, custom_role_ids: [] }]);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const ROLE_LABELS: Record<AppRole, string> = {
    admin: t('workers.role_admin'),
    branch_admin: t('workers.role_branch_admin'),
    supervisor: t('workers.role_supervisor'),
    worker: t('workers.role_worker'),
    project_manager: 'مدير المشروع',
    accountant: 'المحاسب',
    admin_assistant: 'عون إداري',
  };

  const ALL_ROLES: AppRole[] = ['worker', 'branch_admin', 'supervisor', 'admin'];

  useEffect(() => {
    fetchData();
  }, []);

  // Filter workers by activeBranch
  const filteredWorkers = useMemo(() => {
    // Exclude test workers from main list
    let result = workers.filter(w => !(w as any).is_test);
    if (isAdminRole(role) && activeBranch) {
      result = result.filter(w => 
        w.branch_id === activeBranch.id || 
        w.worker_roles.some(wr => wr.branch_id === activeBranch.id)
      );
    }
    return result;
  }, [workers, activeBranch, role]);

  const fetchData = async () => {
    try {
      const [workersRes, branchesRes, workerRolesRes, customRolesRes] = await Promise.all([
        supabase.from('workers').select('*').order('created_at', { ascending: false }),
        supabase.from('branches').select('*').eq('is_active', true).order('name'),
        supabase.from('worker_roles').select('*, branches(name), custom_roles(name_ar)'),
        supabase.from('custom_roles').select('*').order('is_system', { ascending: false }).order('name_ar')
      ]);

      if (workersRes.error) throw workersRes.error;
      if (branchesRes.error) throw branchesRes.error;
      if (workerRolesRes.error) throw workerRolesRes.error;
      if (customRolesRes.error) throw customRolesRes.error;

      // Group worker roles by worker_id and branch_id to combine custom roles
      const workerRolesMap = new Map<string, Map<string, { role: AppRole; branch_id: string | null; branch_name: string | null; custom_role_ids: string[]; custom_role_names: string[] }>>();
      
      (workerRolesRes.data || []).forEach(wr => {
        const workerId = wr.worker_id;
        const branchKey = `${wr.role}-${wr.branch_id || 'null'}`;
        
        if (!workerRolesMap.has(workerId)) {
          workerRolesMap.set(workerId, new Map());
        }
        
        const workerMap = workerRolesMap.get(workerId)!;
        
        if (!workerMap.has(branchKey)) {
          workerMap.set(branchKey, {
            role: wr.role as AppRole,
            branch_id: wr.branch_id,
            branch_name: (wr.branches as any)?.name || null,
            custom_role_ids: [],
            custom_role_names: []
          });
        }
        
        const entry = workerMap.get(branchKey)!;
        if (wr.custom_role_id) {
          entry.custom_role_ids.push(wr.custom_role_id);
          const customRoleName = (wr.custom_roles as any)?.name_ar;
          if (customRoleName) {
            entry.custom_role_names.push(customRoleName);
          }
        }
      });

      // Map worker roles to workers
      const workersWithRoles: WorkerWithRoles[] = (workersRes.data || []).map(worker => {
        const workerMap = workerRolesMap.get(worker.id);
        const roles: WorkerRoleEntry[] = workerMap 
          ? Array.from(workerMap.values())
          : [];
        
        return {
          ...worker,
          worker_roles: roles
        };
      });

      setWorkers(workersWithRoles);
      setBranches(branchesRes.data || []);
      setCustomRoles(customRolesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('common.loading'));
    } finally {
      setIsLoading(false);
    }
  };

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return null;
    return branches.find(b => b.id === branchId)?.name;
  };

  const addRoleEntry = () => {
    setWorkerRoles([...workerRoles, { role: 'worker', branch_id: null, custom_role_ids: [] }]);
  };

  const removeRoleEntry = (index: number) => {
    if (workerRoles.length > 1) {
      setWorkerRoles(workerRoles.filter((_, i) => i !== index));
    }
  };

  const updateRoleEntry = (index: number, field: 'role' | 'branch_id', value: string) => {
    const updated = [...workerRoles];
    if (field === 'role') {
      updated[index].role = value as AppRole;
      // Reset custom roles when changing system role
      if (value !== 'worker') {
        updated[index].custom_role_ids = [];
      }
    } else if (field === 'branch_id') {
      updated[index].branch_id = value === 'none' ? null : value;
    }
    setWorkerRoles(updated);
  };

  const toggleCustomRole = (index: number, customRoleId: string) => {
    const updated = [...workerRoles];
    const currentIds = updated[index].custom_role_ids || [];
    
    if (currentIds.includes(customRoleId)) {
      updated[index].custom_role_ids = currentIds.filter(id => id !== customRoleId);
    } else {
      updated[index].custom_role_ids = [...currentIds, customRoleId];
    }
    setWorkerRoles(updated);
  };

  const getCustomRoleName = (customRoleId: string | null) => {
    if (!customRoleId) return null;
    return customRoles.find(cr => cr.id === customRoleId)?.name_ar;
  };



  const handleDeleteWorker = async (worker: WorkerWithRoles) => {
    try {
      // Delete worker roles first
      await supabase.from('worker_roles').delete().eq('worker_id', worker.id);
      await supabase.from('user_roles').delete().eq('worker_id', worker.id);
      const { error } = await supabase.from('workers').delete().eq('id', worker.id);
      if (error) throw error;
      toast.success(`تم حذف العامل "${worker.full_name}" بنجاح`);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting worker:', error);
      toast.error('فشل في حذف العامل: ' + error.message);
    }
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !fullName.trim() || !password.trim()) {
      toast.error(t('auth.fill_all_fields'));
      return;
    }

    if (workerRoles.length === 0) {
      toast.error(t('workers.one_role_required'));
      return;
    }

    setIsSaving(true);
    try {
      // Check if username already exists
      const { data: existingWorker } = await supabase
        .from('workers')
        .select('id')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle();

      if (existingWorker) {
        throw new Error(t('auth.invalid_credentials'));
      }

      // Create worker record
      const passwordHash = btoa(password);
      
      // Use the first role's branch or activeBranch as the default
      const firstRole = workerRoles[0];
      const finalBranchId = firstRole.branch_id || (isAdminRole(role) && activeBranch ? activeBranch.id : null);
      
      const { data: newWorker, error: workerError } = await supabase
        .from('workers')
        .insert({
          username: username.trim().toLowerCase(),
          full_name: fullName.trim(),
          password_hash: passwordHash,
          role: firstRole.role,
          branch_id: finalBranchId,
          is_active: true,
        })
        .select()
        .single();

      if (workerError) throw workerError;

      // Insert worker roles - create one entry per custom role
      const rolesToInsert: { worker_id: string; role: AppRole; branch_id: string | null; custom_role_id: string | null }[] = [];
      
      workerRoles.forEach(wr => {
        const branchId = wr.branch_id || (isAdminRole(role) && activeBranch ? activeBranch.id : null);
        
        if (wr.custom_role_ids && wr.custom_role_ids.length > 0) {
          // Insert one row per custom role
          wr.custom_role_ids.forEach(customRoleId => {
            rolesToInsert.push({
              worker_id: newWorker.id,
              role: wr.role,
              branch_id: branchId,
              custom_role_id: customRoleId
            });
          });
        } else {
          // Insert one row without custom role
          rolesToInsert.push({
            worker_id: newWorker.id,
            role: wr.role,
            branch_id: branchId,
            custom_role_id: null
          });
        }
      });

      const { error: rolesError } = await supabase
        .from('worker_roles')
        .insert(rolesToInsert);

      if (rolesError) throw rolesError;

      toast.success(t('workers.add') + ' ✓');
      setShowAddDialog(false);
      setUsername('');
      setFullName('');
      setPassword('');
      setWorkerRoles([{ role: 'worker', branch_id: null, custom_role_ids: [] }]);
      fetchData();
    } catch (error: any) {
      console.error('Error adding worker:', error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openRolesDialog = (worker: WorkerWithRoles) => {
    setSelectedWorker(worker);
    setWorkerRoles(worker.worker_roles.length > 0 
      ? worker.worker_roles.map(wr => ({ role: wr.role, branch_id: wr.branch_id, custom_role_ids: wr.custom_role_ids || [] }))
      : [{ role: worker.role, branch_id: worker.branch_id, custom_role_ids: [] }]
    );
    setShowRolesDialog(true);
  };

  const saveWorkerRoles = async () => {
    if (!selectedWorker) return;

    if (workerRoles.length === 0) {
      toast.error(t('workers.one_role_required'));
      return;
    }

    setIsSaving(true);
    try {
      // Delete existing roles
      const { error: deleteError } = await supabase
        .from('worker_roles')
        .delete()
        .eq('worker_id', selectedWorker.id);

      if (deleteError) throw deleteError;

      // Insert new roles - create one entry per custom role
      const rolesToInsert: { worker_id: string; role: AppRole; branch_id: string | null; custom_role_id: string | null }[] = [];
      
      workerRoles.forEach(wr => {
        if (wr.custom_role_ids && wr.custom_role_ids.length > 0) {
          wr.custom_role_ids.forEach(customRoleId => {
            rolesToInsert.push({
              worker_id: selectedWorker.id,
              role: wr.role,
              branch_id: wr.branch_id,
              custom_role_id: customRoleId
            });
          });
        } else {
          rolesToInsert.push({
            worker_id: selectedWorker.id,
            role: wr.role,
            branch_id: wr.branch_id,
            custom_role_id: null
          });
        }
      });

      const { error: insertError } = await supabase
        .from('worker_roles')
        .insert(rolesToInsert);

      if (insertError) throw insertError;

      // Update the main worker record with the first role
      const { error: updateError } = await supabase
        .from('workers')
        .update({ 
          role: workerRoles[0].role,
          branch_id: workerRoles[0].branch_id 
        })
        .eq('id', selectedWorker.id);

      if (updateError) throw updateError;

      toast.success(t('workers.roles_updated'));
      setShowRolesDialog(false);
      setSelectedWorker(null);
      fetchData();
    } catch (error: any) {
      console.error('Error updating worker roles:', error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWorkerStatus = async (worker: Worker) => {
    try {
      const { error } = await supabase
        .from('workers')
        .update({ is_active: !worker.is_active })
        .eq('id', worker.id);

      if (error) throw error;

      toast.success(worker.is_active ? t('common.inactive') : t('common.active'));
      fetchData();
    } catch (error) {
      console.error('Error toggling worker status:', error);
      toast.error(t('common.loading'));
    }
  };

  const RoleEntryForm = ({ roles, onAdd, onRemove, onUpdate, onToggleCustomRole, showBranchDefault = false }: {
    roles: WorkerRoleEntry[];
    onAdd: () => void;
    onRemove: (index: number) => void;
    onUpdate: (index: number, field: 'role' | 'branch_id', value: string) => void;
    onToggleCustomRole: (index: number, customRoleId: string) => void;
    showBranchDefault?: boolean;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('workers.roles_and_permissions')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 ml-1" />
          {t('workers.add_role')}
        </Button>
      </div>
      {roles.map((roleEntry, index) => (
        <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
            {roles.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => onRemove(index)}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {/* الصفة - Role Type */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Shield className="w-3 h-3" />
              {t('workers.the_rank')}
            </Label>
            <Select
              value={roleEntry.role}
              onValueChange={(val) => onUpdate(index, 'role', val)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t('workers.select_role')} />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* الدور المخصص - Custom Role - يظهر فقط للصفة "عامل" */}
          {roleEntry.role === 'worker' && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {t('workers.custom_roles')}
              </Label>
              <div className="space-y-2 p-2 border rounded-md bg-background">
                {customRoles
                  .filter(cr => !['admin', 'branch_admin', 'supervisor', 'worker'].includes(cr.code))
                  .map((cr) => (
                    <div key={cr.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`${index}-${cr.id}`}
                        checked={(roleEntry.custom_role_ids || []).includes(cr.id)}
                        onCheckedChange={() => onToggleCustomRole(index, cr.id)}
                      />
                      <label 
                        htmlFor={`${index}-${cr.id}`} 
                        className="text-sm cursor-pointer"
                      >
                        {cr.name_ar}
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* الفرع - Branch */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {t('workers.the_branch')}
            </Label>
            {(showBranchDefault && isAdminRole(role) && activeBranch) ? (
              <div className="text-sm text-muted-foreground px-2 py-1.5 bg-background rounded border">
                {activeBranch.name}
              </div>
            ) : (
              <Select
                value={roleEntry.branch_id || 'none'}
                onValueChange={(val) => onUpdate(index, 'branch_id', val)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('branches.select_branch')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('branches.without_branch')}</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ))}
    </div>
  );

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
        <h2 className="text-xl font-bold">{t('workers.title')}</h2>
      </div>

      <Tabs defaultValue="workers" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="workers" className="flex-1 gap-1">
            <Users className="w-4 h-4" />
            العمال
          </TabsTrigger>
          <TabsTrigger value="test" className="flex-1 gap-1">
            <FlaskConical className="w-4 h-4" />
            تجريبي
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workers" className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="w-4 h-4 ml-2" />
              {t('workers.add')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>{t('workers.add_new')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddWorker} className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>{t('workers.full_name')}</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('workers.full_name')}
                  className="text-right"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.username')}</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.enter_username')}
                  className="text-right"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.password')}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.enter_password')}
                    className="text-right pl-10"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <RoleEntryForm
                roles={workerRoles}
                onAdd={addRoleEntry}
                onRemove={removeRoleEntry}
                onUpdate={updateRoleEntry}
                onToggleCustomRole={toggleCustomRole}
                showBranchDefault={true}
              />

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('workers.add')
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <Card className="bg-secondary text-secondary-foreground">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('workers.total')}</p>
            <p className="text-2xl font-bold">{filteredWorkers.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Workers List */}
      <div className="space-y-3">
        {filteredWorkers.map((worker) => (
          <Card key={worker.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{worker.full_name}</p>
                  <p className="text-sm text-muted-foreground">@{worker.username}</p>
                  
                  {/* Roles badges */}
                  <div className="mt-3 space-y-2">
                    {worker.worker_roles.length > 0 ? (
                      worker.worker_roles.map((wr, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            {ROLE_LABELS[wr.role]}
                          </Badge>
                          {wr.custom_role_names && wr.custom_role_names.length > 0 && (
                            wr.custom_role_names.map((name, crIdx) => (
                              <Badge key={crIdx} variant="outline" className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {name}
                              </Badge>
                            ))
                          )}
                          {wr.branch_name && (
                            <Badge variant="outline" className="text-muted-foreground">
                              <Building2 className="w-3 h-3 ml-1" />
                              {wr.branch_name}
                            </Badge>
                          )}
                        </div>
                      ))
                    ) : (
                      <Badge variant="secondary">
                        <Shield className="w-3 h-3 ml-1" />
                        {ROLE_LABELS[worker.role]}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Edit roles button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => openRolesDialog(worker)}
                  >
                    <Shield className="w-4 h-4 ml-2" />
                    {t('workers.manage_roles')}
                  </Button>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${worker.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {worker.is_active ? t('common.active') : t('common.inactive')}
                  </span>
                  <Switch
                    checked={worker.is_active}
                    onCheckedChange={() => toggleWorkerStatus(worker)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/30"
                    onClick={() => setDeleteWorker(worker)}
                    title="حذف العامل"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {workers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('workers.no_workers')}</p>
          </div>
        )}
      </div>

      {/* Edit Roles Dialog */}
      <Dialog open={showRolesDialog} onOpenChange={setShowRolesDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {t('workers.manage_roles')} - {selectedWorker?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
            <RoleEntryForm
              roles={workerRoles}
              onAdd={addRoleEntry}
              onRemove={removeRoleEntry}
              onUpdate={updateRoleEntry}
              onToggleCustomRole={toggleCustomRole}
            />
          </div>
          <div className="flex gap-2 pt-4">
            <Button onClick={saveWorkerRoles} disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
            <Button variant="outline" onClick={() => setShowRolesDialog(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Worker */}
      <AlertDialog open={!!deleteWorker} onOpenChange={() => setDeleteWorker(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-destructive" />حذف العامل</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف العامل "{deleteWorker?.full_name}"؟ سيتم حذف جميع بياناته ولا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteWorker) handleDeleteWorker(deleteWorker); setDeleteWorker(null); }}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="test" className="mt-4">
          <TestWorkersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Workers;
