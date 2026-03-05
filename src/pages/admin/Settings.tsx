import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFontSize, FontSize } from '@/contexts/FontSizeContext';
import { useWorkerPermissions } from '@/hooks/usePermissions';
import { Users, Coffee, LogOut, Info, Globe, Shield, Building2, RefreshCw, Key, Loader2, Type, MessageSquare } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import icon from '@/assets/icon.png';
import RoleSelectionDialog from '@/components/auth/RoleSelectionDialog';
import BranchSelectionDialog from '@/components/auth/BranchSelectionDialog';
import PrintSettingsCard from '@/components/settings/PrintSettingsCard';
import NavbarCustomization from '@/components/settings/NavbarCustomization';
import DataManagement from '@/components/settings/DataManagement';
import LocationSettingsCard from '@/components/settings/LocationSettingsCard';
import CustomerTypesCard from '@/components/settings/CustomerTypesCard';
import CompanyInfoCard from '@/components/settings/CompanyInfoCard';
import VerificationChecklistCard from '@/components/settings/VerificationChecklistCard';
import SmsSettingsCard from '@/components/settings/SmsSettingsCard';
import AppUpdateSettingsCard from '@/components/settings/AppUpdateSettingsCard';

const Settings: React.FC = () => {
  const { user, logout, role, activeBranch, availableRoles, switchRole, switchBranch, showRoleSelection, showBranchSelection, selectRole, selectBranch } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { fontSize, setFontSize } = useFontSize();
  const { data: myPermissions, isLoading: permissionsLoading } = useWorkerPermissions();

  const getRoleLabel = (roleValue: string) => {
    switch (roleValue) {
      case 'admin': return t('workers.role_admin');
      case 'branch_admin': return t('workers.role_branch_admin');
      case 'supervisor': return t('workers.role_supervisor');
      case 'worker': return t('workers.role_worker');
      default: return roleValue;
    }
  };

  // Group permissions by category
  const groupedPermissions = myPermissions?.reduce((acc, p) => {
    const category = p.category || t('settings.other');
    if (!acc[category]) acc[category] = [];
    acc[category].push(p);
    return acc;
  }, {} as Record<string, typeof myPermissions>);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('settings.title')}</h2>

      {/* Current Role & Branch */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5" />
            {t('settings.current_role')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{t('settings.role')}</span>
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
              {getRoleLabel(role || '')}
            </span>
          </div>
          
          {role === 'admin' && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t('settings.branch')}</span>
              <span className="bg-secondary px-3 py-1 rounded-full text-sm font-medium">
                {activeBranch ? activeBranch.name : t('settings.all_branches')}
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {availableRoles.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={switchRole}
              >
                <RefreshCw className="w-4 h-4 ms-2" />
                {t('settings.switch_role')}
              </Button>
            )}
            
            {role === 'admin' && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={switchBranch}
              >
                <Building2 className="w-4 h-4 ms-2" />
                {t('settings.switch_branch')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* My Active Permissions - Only for non-admin */}
      {role !== 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="w-5 h-5" />
              {t('settings.my_permissions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {permissionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : myPermissions && myPermissions.length > 0 ? (
              <div className="space-y-3">
                {Object.entries(groupedPermissions || {}).map(([category, perms]) => (
                  <div key={category}>
                    <p className="text-sm font-medium text-muted-foreground mb-2">{category}</p>
                    <div className="flex flex-wrap gap-1">
                      {perms?.map((p) => (
                        <Badge key={p.permission_code} variant="secondary" className="text-xs">
                          {p.permission_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('settings.no_permissions')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Language Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5" />
            {t('settings.language')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={language} onValueChange={(val) => setLanguage(val as 'ar' | 'fr' | 'en')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">
                <span className="flex items-center gap-2">
                  🇩🇿 {t('settings.arabic')}
                </span>
              </SelectItem>
              <SelectItem value="fr">
                <span className="flex items-center gap-2">
                  🇫🇷 {t('settings.french')}
                </span>
              </SelectItem>
              <SelectItem value="en">
                <span className="flex items-center gap-2">
                  🇺🇸 {t('settings.english')}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Type className="w-5 h-5" />
            {t('settings.font_size')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
              <Button
                key={size}
                variant={fontSize === size ? 'default' : 'outline'}
                className="flex-1"
                size="sm"
                onClick={() => setFontSize(size)}
              >
                {t(`settings.font_${size}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      {(role === 'admin' || role === 'branch_admin') && (
        <PrintSettingsCard />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <NavbarCustomization />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <DataManagement />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <LocationSettingsCard />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <CustomerTypesCard />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <CompanyInfoCard />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <VerificationChecklistCard />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <SmsSettingsCard />
      )}
      {(role === 'admin' || role === 'branch_admin') && (
        <AppUpdateSettingsCard />
      )}

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            {t('settings.account_info')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('common.name')}</span>
            <span className="font-medium">{user?.full_name || t('workers.role_admin')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('auth.username')}</span>
            <span className="font-medium">@{user?.username || 'admin'}</span>
          </div>
          {availableRoles.length > 0 && (
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">{t('settings.available_roles')}</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {availableRoles.map((r, i) => (
                  <span key={i} className="bg-secondary px-2 py-0.5 rounded text-xs">
                    {getRoleLabel(r.role)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* App Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coffee className="w-5 h-5" />
            {t('settings.app_info')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{t('app.name')}</span>
            <div className="flex items-center gap-2">
              <img src={icon} alt="Laser Food" className="w-6 h-6" />
              <span className="font-medium">Laser Food</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('settings.version')}</span>
            <span className="font-medium">1.0.0</span>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="w-5 h-5" />
            {t('settings.about')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('settings.about_text')}
          </p>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="destructive"
        className="w-full"
        size="lg"
        onClick={logout}
      >
        <LogOut className="w-4 h-4 ms-2" />
        {t('auth.logout')}
      </Button>

      {/* Role Selection Dialog */}
      <RoleSelectionDialog
        open={showRoleSelection}
        roles={availableRoles}
        onSelectRole={selectRole}
      />

      {/* Branch Selection Dialog */}
      <BranchSelectionDialog
        open={showBranchSelection}
        onSelectBranch={selectBranch}
      />
    </div>
  );
};

export default Settings;