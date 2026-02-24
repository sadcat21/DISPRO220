import React, { useState } from 'react';
import { Plus, Shield, Trash2, Edit, Save, X, ChevronDown, ChevronUp, Briefcase, User, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  usePermissions,
  useRolesWithPermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useUpdateRolePermissions,
} from '@/hooks/usePermissions';
import { Permission, PERMISSION_CATEGORIES, RESOURCE_NAMES, PermissionCategory, SYSTEM_ROLE_CODES, FUNCTIONAL_ROLE_CODES, ROLE_TYPE_LABELS } from '@/types/permissions';
import { Loader2 } from 'lucide-react';
import RoleCard from '@/components/permissions/RoleCard';
import WorkerPermissionsSection from '@/components/permissions/WorkerPermissionsSection';
import WorkerUIOverridesSection from '@/components/permissions/WorkerUIOverridesSection';

const Permissions: React.FC = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: permissions, isLoading: permissionsLoading } = usePermissions();
  const { data: roles, isLoading: rolesLoading } = useRolesWithPermissions();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const updateRolePermissions = useUpdateRolePermissions();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState({ code: '', name_ar: '', description_ar: '' });
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [rolePermissions, setRolePermissions] = useState<Record<string, Set<string>>>({});

  // Initialize role permissions from data
  React.useEffect(() => {
    if (roles) {
      const initialPermissions: Record<string, Set<string>> = {};
      roles.forEach(role => {
        initialPermissions[role.id] = new Set(role.permissions.map(p => p.id));
      });
      setRolePermissions(initialPermissions);
    }
  }, [roles]);

  const groupedPermissions = React.useMemo<Record<PermissionCategory, Record<string, Permission[]>>>(() => {
    const grouped: Record<PermissionCategory, Record<string, Permission[]>> = {
      page_access: {},
      crud: {},
      data_scope: {},
    };
    
    if (!permissions) return grouped;

    permissions.forEach(permission => {
      const category = permission.category as PermissionCategory;
      const resource = permission.resource || 'other';
      
      if (!grouped[category][resource]) {
        grouped[category][resource] = [];
      }
      grouped[category][resource].push(permission);
    });

    return grouped;
  }, [permissions]);

  const toggleRole = (roleId: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const togglePermission = (roleId: string, permissionId: string) => {
    setRolePermissions(prev => {
      const rolePerms = new Set(prev[roleId] || []);
      if (rolePerms.has(permissionId)) {
        rolePerms.delete(permissionId);
      } else {
        rolePerms.add(permissionId);
      }
      return { ...prev, [roleId]: rolePerms };
    });
  };

  const handleCreateRole = async () => {
    if (!newRole.code || !newRole.name_ar) {
      toast({ title: t('permissions.fill_required'), variant: 'destructive' });
      return;
    }

    try {
      await createRole.mutateAsync(newRole);
      toast({ title: t('permissions.role_created') });
      setIsAddDialogOpen(false);
      setNewRole({ code: '', name_ar: '', description_ar: '' });
    } catch (error: any) {
      toast({ title: t('permissions.role_create_failed'), description: error.message, variant: 'destructive' });
    }
  };

  const handleSavePermissions = async (roleId: string) => {
    try {
      const permissionIds = Array.from(rolePermissions[roleId] || []);
      await updateRolePermissions.mutateAsync({ roleId, permissionIds });
      toast({ title: t('permissions.permissions_saved') });
    } catch (error: any) {
      toast({ title: t('permissions.permissions_save_failed'), description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleId) return;

    try {
      await deleteRole.mutateAsync(deleteRoleId);
      toast({ title: t('permissions.role_deleted') });
      setDeleteRoleId(null);
    } catch (error: any) {
      toast({ title: t('permissions.role_delete_failed'), description: error.message, variant: 'destructive' });
    }
  };

  if (permissionsLoading || rolesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('permissions.title')}</h1>
        </div>
      </div>

      <Tabs defaultValue="roles" dir="rtl">
        <TabsList className="w-full">
          <TabsTrigger value="roles" className="flex-1 gap-1.5">
            <Shield className="w-4 h-4" />
            صلاحيات الأدوار
          </TabsTrigger>
          <TabsTrigger value="individual" className="flex-1 gap-1.5">
            <User className="w-4 h-4" />
            صلاحيات فردية
          </TabsTrigger>
          <TabsTrigger value="ui-overrides" className="flex-1 gap-1.5">
            <EyeOff className="w-4 h-4" />
            إخفاء العناصر
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  {t('permissions.add_role')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('permissions.add_role')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium">{t('permissions.role_code')}</label>
                    <Input
                      value={newRole.code}
                      onChange={(e) => setNewRole(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                      placeholder={t('permissions.role_code_example')}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('permissions.role_name')}</label>
                    <Input
                      value={newRole.name_ar}
                      onChange={(e) => setNewRole(prev => ({ ...prev, name_ar: e.target.value }))}
                      placeholder={t('permissions.role_name_example')}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('permissions.role_description')}</label>
                    <Input
                      value={newRole.description_ar}
                      onChange={(e) => setNewRole(prev => ({ ...prev, description_ar: e.target.value }))}
                      placeholder={t('permissions.role_description_placeholder')}
                    />
                  </div>
                  <Button onClick={handleCreateRole} className="w-full" disabled={createRole.isPending}>
                    {createRole.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('permissions.create_role')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* System Roles Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">{t('permissions.system_roles')}</h2>
            </div>
            {roles?.filter(role => SYSTEM_ROLE_CODES.includes(role.code)).map(role => (
              <RoleCard 
                key={role.id}
                role={role}
                isExpanded={expandedRoles.has(role.id)}
                onToggle={() => toggleRole(role.id)}
                rolePermissions={rolePermissions}
                groupedPermissions={groupedPermissions}
                onTogglePermission={togglePermission}
                onSave={handleSavePermissions}
                onDelete={setDeleteRoleId}
                isSaving={updateRolePermissions.isPending}
              />
            ))}
          </div>

          {/* Functional Roles Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-accent-foreground" />
              <h2 className="text-lg font-semibold">{t('permissions.functional_roles')}</h2>
              <Badge variant="outline" className="text-xs">{t('workers.for_workers')}</Badge>
            </div>
            {roles?.filter(role => FUNCTIONAL_ROLE_CODES.includes(role.code)).map(role => (
              <RoleCard 
                key={role.id}
                role={role}
                isExpanded={expandedRoles.has(role.id)}
                onToggle={() => toggleRole(role.id)}
                rolePermissions={rolePermissions}
                groupedPermissions={groupedPermissions}
                onTogglePermission={togglePermission}
                onSave={handleSavePermissions}
                onDelete={setDeleteRoleId}
                isSaving={updateRolePermissions.isPending}
                isFunctional
              />
            ))}
          </div>

          {/* Custom Roles Section */}
          {roles?.filter(role => !SYSTEM_ROLE_CODES.includes(role.code) && !FUNCTIONAL_ROLE_CODES.includes(role.code)).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('permissions.custom_roles')}</h2>
              </div>
              {roles?.filter(role => !SYSTEM_ROLE_CODES.includes(role.code) && !FUNCTIONAL_ROLE_CODES.includes(role.code)).map(role => (
                <RoleCard 
                  key={role.id}
                  role={role}
                  isExpanded={expandedRoles.has(role.id)}
                  onToggle={() => toggleRole(role.id)}
                  rolePermissions={rolePermissions}
                  groupedPermissions={groupedPermissions}
                  onTogglePermission={togglePermission}
                  onSave={handleSavePermissions}
                  onDelete={setDeleteRoleId}
                  isSaving={updateRolePermissions.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="individual" className="mt-4">
          <WorkerPermissionsSection />
        </TabsContent>

        <TabsContent value="ui-overrides" className="mt-4">
          <WorkerUIOverridesSection />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRoleId} onOpenChange={() => setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('permissions.confirm_delete_role')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('permissions.delete_warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Permissions;
