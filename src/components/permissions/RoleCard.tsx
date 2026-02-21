import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Trash2, Save, Loader2, Briefcase, Shield } from 'lucide-react';
import { Permission, PERMISSION_CATEGORIES, RESOURCE_NAMES, PermissionCategory, RoleWithPermissions } from '@/types/permissions';
import { useLanguage } from '@/contexts/LanguageContext';

interface RoleCardProps {
  role: RoleWithPermissions;
  isExpanded: boolean;
  onToggle: () => void;
  rolePermissions: Record<string, Set<string>>;
  groupedPermissions: Record<PermissionCategory, Record<string, Permission[]>>;
  onTogglePermission: (roleId: string, permissionId: string) => void;
  onSave: (roleId: string) => void;
  onDelete: (roleId: string) => void;
  isSaving: boolean;
  isFunctional?: boolean;
}

const RoleCard: React.FC<RoleCardProps> = ({
  role,
  isExpanded,
  onToggle,
  rolePermissions,
  groupedPermissions,
  onTogglePermission,
  onSave,
  onDelete,
  isSaving,
  isFunctional = false,
}) => {
  const { t, language } = useLanguage();
  
  // Get role display name based on language
  const getRoleName = () => {
    if (language === 'ar') return role.name_ar;
    // For now, use Arabic name for all languages as we don't have translations in DB
    return role.name_ar;
  };
  
  const getRoleDescription = () => {
    if (language === 'ar') return role.description_ar;
    return role.description_ar;
  };
  
  return (
    <Card className={`overflow-hidden ${isFunctional ? 'border-orange-500/30' : ''}`}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                {isFunctional ? (
                  <Briefcase className="w-5 h-5 text-accent-foreground" />
                ) : (
                  <Shield className="w-5 h-5 text-primary" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{getRoleName()}</CardTitle>
                    {role.is_system && (
                      <Badge variant="secondary" className="text-xs">
                        {isFunctional ? t('permissions.functional') : t('permissions.system')}
                      </Badge>
                    )}
                  </div>
                  {getRoleDescription() && (
                    <p className="text-sm text-muted-foreground mt-1">{getRoleDescription()}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {role.permissions.length} {t('permissions.permission_count')}
              </Badge>
              {!role.is_system && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(role.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-6">
              {/* Page Access Permissions */}
              {groupedPermissions.page_access && Object.keys(groupedPermissions.page_access).length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-primary">{PERMISSION_CATEGORIES.page_access}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(groupedPermissions.page_access).flatMap(([_, perms]) =>
                      perms.map(perm => (
                        <label
                          key={perm.id}
                          className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            checked={rolePermissions[role.id]?.has(perm.id) || false}
                            onCheckedChange={() => onTogglePermission(role.id, perm.id)}
                          />
                          <span className="text-sm">{perm.name_ar}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* CRUD Permissions */}
              {groupedPermissions.crud && Object.keys(groupedPermissions.crud).length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-primary">{PERMISSION_CATEGORIES.crud}</h3>
                  <div className="space-y-4">
                    {Object.entries(groupedPermissions.crud).map(([resource, perms]) => (
                      <div key={resource} className="p-3 rounded-lg bg-muted/30">
                        <h4 className="font-medium mb-2 text-sm">{RESOURCE_NAMES[resource] || resource}</h4>
                        <div className="flex flex-wrap gap-3">
                          {perms.map(perm => (
                            <label
                              key={perm.id}
                              className="flex items-center gap-2 p-2 rounded-lg border bg-background cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              <Checkbox
                                checked={rolePermissions[role.id]?.has(perm.id) || false}
                                onCheckedChange={() => onTogglePermission(role.id, perm.id)}
                              />
                              <span className="text-sm">{perm.name_ar}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Scope Permissions */}
              {groupedPermissions.data_scope && Object.keys(groupedPermissions.data_scope).length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-primary">{PERMISSION_CATEGORIES.data_scope}</h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(groupedPermissions.data_scope).flatMap(([_, perms]) =>
                      perms.map(perm => (
                        <label
                          key={perm.id}
                          className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            checked={rolePermissions[role.id]?.has(perm.id) || false}
                            onCheckedChange={() => onTogglePermission(role.id, perm.id)}
                          />
                          <div>
                            <span className="text-sm font-medium">{perm.name_ar}</span>
                            {perm.description_ar && (
                              <p className="text-xs text-muted-foreground">{perm.description_ar}</p>
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={() => onSave(role.id)}
                  disabled={isSaving}
                  className="gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {t('common.save_changes')}
                </Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default RoleCard;