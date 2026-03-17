import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkerPermissions } from '@/hooks/usePermissions';
import { isAdminRole } from '@/lib/utils';
import { Navigate } from 'react-router-dom';
import { Loader2, ShieldX } from 'lucide-react';

interface PermissionGateProps {
  children: React.ReactNode;
  requiredPermissions: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  requiredPermissions,
  requireAll = false,
  fallback,
  redirectTo,
}) => {
  const { role } = useAuth();
  const { data: permissions, isLoading } = useWorkerPermissions();

  // Admin-level roles have all permissions
  if (isAdminRole(role)) {
    return <>{children}</>;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check permissions
  const userPermissionCodes = permissions?.map(p => p.permission_code) || [];
  
  const hasPermission = requireAll
    ? requiredPermissions.every(p => userPermissionCodes.includes(p))
    : requiredPermissions.some(p => userPermissionCodes.includes(p));

  if (!hasPermission) {
    // Redirect if specified
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    // Show fallback if provided
    if (fallback) {
      return <>{fallback}</>;
    }

    // Default unauthorized view
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ShieldX className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-xl font-bold mb-2">غير مصرح</h2>
        <p className="text-sm">ليس لديك صلاحية الوصول لهذه الصفحة</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionGate;
