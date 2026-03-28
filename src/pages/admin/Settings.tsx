import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFontSize, FontSize } from '@/contexts/FontSizeContext';
import { useWorkerPermissions } from '@/hooks/usePermissions';
import { Users, Coffee, LogOut, Info, Globe, Shield, Building2, RefreshCw, Key, Loader2, Type } from 'lucide-react';
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
import { isAdminRole, isSuperAdminRole } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 pt-2 pb-1">
    <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-wide">
      {icon}
      {title}
    </div>
    <Separator className="flex-1" />
  </div>
);

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

  const groupedPermissions = myPermissions?.reduce((acc, p) => {
    const category = p.category || t('settings.other');
    if (!acc[category]) acc[category] = [];
    acc[category].push(p);
    return acc;
  }, {} as Record<string, typeof myPermissions>);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold">{t('settings.title')}</h2>

      {/* ═══════ Section: Account & Role ═══════ */}
      <SectionHeader icon={<Shield className="w-4 h-4" />} title={t('settings.current_role')} />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('settings.role')}</span>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{getRoleLabel(role || '')}</Badge>
          </div>
          {(isSuperAdminRole(role) || role === 'branch_admin') && activeBranch && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('settings.branch')}</span>
              <Badge variant="secondary">{activeBranch.name}</Badge>
            </div>
          )}
          {isSuperAdminRole(role) && !activeBranch && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('settings.branch')}</span>
              <Badge variant="secondary">{t('settings.all_branches')}</Badge>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {availableRoles.length > 1 && (
              <Button variant="outline" size="sm" className="flex-1" onClick={switchRole}>
                <RefreshCw className="w-4 h-4 ms-2" />{t('settings.switch_role')}
              </Button>
            )}
            {isSuperAdminRole(role) && (
              <Button variant="outline" size="sm" className="flex-1" onClick={switchBranch}>
                <Building2 className="w-4 h-4 ms-2" />{t('settings.switch_branch')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* My Permissions - non-admin only */}
      {role !== 'admin' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="w-4 h-4" />{t('settings.my_permissions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {permissionsLoading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : myPermissions && myPermissions.length > 0 ? (
              <div className="space-y-3">
                {Object.entries(groupedPermissions || {}).map(([category, perms]) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{category}</p>
                    <div className="flex flex-wrap gap-1">
                      {perms?.map((p) => (
                        <Badge key={p.permission_code} variant="secondary" className="text-xs">{p.permission_name}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('settings.no_permissions')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════ Section: Preferences ═══════ */}
      <SectionHeader icon={<Globe className="w-4 h-4" />} title="التفضيلات" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Language */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-muted-foreground" /> {t('settings.language')}
            </p>
            <Select value={language} onValueChange={(val) => setLanguage(val as 'ar' | 'fr' | 'en')}>
              <SelectTrigger className="w-full h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar"><span className="flex items-center gap-2">🇩🇿 {t('settings.arabic')}</span></SelectItem>
                <SelectItem value="fr"><span className="flex items-center gap-2">🇫🇷 {t('settings.french')}</span></SelectItem>
                <SelectItem value="en"><span className="flex items-center gap-2">🇺🇸 {t('settings.english')}</span></SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Font Size */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Type className="w-4 h-4 text-muted-foreground" /> {t('settings.font_size')}
            </p>
            <div className="flex gap-1.5">
              {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
                <Button key={size} variant={fontSize === size ? 'default' : 'outline'} className="flex-1 h-9" size="sm" onClick={() => setFontSize(size)}>
                  {t(`settings.font_${size}`)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ Section: Admin Tools ═══════ */}
      {isAdminRole(role) && (
        <>
          <SectionHeader icon={<Shield className="w-4 h-4" />} title="أدوات المدير" />
          <div className="space-y-3">
            <PrintSettingsCard />
            <NavbarCustomization />
          </div>
        </>
      )}

      {/* ═══════ Section: Super Admin Settings ═══════ */}
      {isSuperAdminRole(role) && (
        <>
          <SectionHeader icon={<Building2 className="w-4 h-4" />} title="إعدادات متقدمة" />
          <div className="space-y-3">
            <CompanyInfoCard />
            <LocationSettingsCard />
            <CustomerTypesCard />
            <VerificationChecklistCard />
            <SmsSettingsCard />
            <AppUpdateSettingsCard />
          </div>

          <SectionHeader icon={<Users className="w-4 h-4" />} title="إدارة البيانات" />
          <DataManagement />
        </>
      )}

      {/* ═══════ Section: Info ═══════ */}
      <SectionHeader icon={<Info className="w-4 h-4" />} title="معلومات" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Account Info */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Users className="w-4 h-4 text-muted-foreground" /> {t('settings.account_info')}
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.name')}</span>
                <span className="font-medium truncate max-w-[140px]">{user?.full_name || t('workers.role_admin')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('auth.username')}</span>
                <span className="font-medium">@{user?.username || 'admin'}</span>
              </div>
              {availableRoles.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {availableRoles.map((r, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{getRoleLabel(r.role)}</Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* App Info */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Coffee className="w-4 h-4 text-muted-foreground" /> {t('settings.app_info')}
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t('app.name')}</span>
                <div className="flex items-center gap-1.5">
                  <img src={icon} alt="Laser Food" className="w-5 h-5" />
                  <span className="font-medium">Laser Food</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('settings.version')}</span>
                <span className="font-medium">1.0.0</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
              {t('settings.about_text')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Logout */}
      <Button variant="destructive" className="w-full" size="lg" onClick={logout}>
        <LogOut className="w-4 h-4 ms-2" />{t('auth.logout')}
      </Button>

      <RoleSelectionDialog open={showRoleSelection} roles={availableRoles} onSelectRole={selectRole} />
      <BranchSelectionDialog open={showBranchSelection} onSelectBranch={selectBranch} />
    </div>
  );
};

export default Settings;
