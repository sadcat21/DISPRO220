import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { Shield, Users, Eye, Briefcase, Building2 } from 'lucide-react';
import { AppRole } from '@/types/database';

interface WorkerRole {
  role: AppRole;
  branch_id: string | null;
  branch_name: string | null;
}

interface RoleSelectionDialogProps {
  open: boolean;
  roles: WorkerRole[];
  onSelectRole: (role: WorkerRole) => void;
}

const RoleSelectionDialog: React.FC<RoleSelectionDialogProps> = ({
  open,
  roles,
  onSelectRole,
}) => {
  const { t, dir } = useLanguage();

  const getRoleIcon = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-6 h-6" />;
      case 'branch_admin':
        return <Building2 className="w-6 h-6" />;
      case 'supervisor':
        return <Eye className="w-6 h-6" />;
      case 'worker':
        return <Briefcase className="w-6 h-6" />;
      default:
        return <Users className="w-6 h-6" />;
    }
  };

  const getRoleLabel = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return t('workers.role_admin');
      case 'branch_admin':
        return t('workers.role_branch_admin');
      case 'supervisor':
        return t('workers.role_supervisor');
      case 'worker':
        return t('workers.role_worker');
      default:
        return role;
    }
  };

  const getRoleDescription = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return t('role_selection.admin_desc');
      case 'branch_admin':
        return t('role_selection.branch_admin_desc');
      case 'supervisor':
        return t('role_selection.supervisor_desc');
      case 'worker':
        return t('role_selection.worker_desc');
      default:
        return '';
    }
  };

  const getRoleColor = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'branch_admin':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'supervisor':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'worker':
        return 'bg-green-500/10 text-green-500 border-green-500/30';
      default:
        return 'bg-primary/10 text-primary border-primary/30';
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" dir={dir} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center text-xl">{t('role_selection.title')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('role_selection.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {roles.map((roleData, index) => (
            <Button
              key={`${roleData.role}-${roleData.branch_id || index}`}
              variant="outline"
              className={`h-auto p-4 flex items-start gap-4 justify-start border-2 hover:scale-[1.02] transition-all ${getRoleColor(roleData.role)}`}
              onClick={() => onSelectRole(roleData)}
            >
              <div className="shrink-0 mt-1">
                {getRoleIcon(roleData.role)}
              </div>
              <div className="text-start">
                <div className="font-bold text-base">
                  {getRoleLabel(roleData.role)}
                  {roleData.branch_name && (
                    <span className="font-normal text-muted-foreground ms-2">
                      ({roleData.branch_name})
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {getRoleDescription(roleData.role)}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RoleSelectionDialog;
