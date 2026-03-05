import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthState, Worker, AppRole, Branch } from '@/types/database';
import { getDeviceFingerprint, getDeviceInfo } from '@/utils/deviceFingerprint';

export interface WorkerRole {
  role: AppRole;
  branch_id: string | null;
  branch_name: string | null;
  custom_role_id?: string | null;
  custom_role_code?: string | null;
  custom_role_name?: string | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ needsRoleSelection: boolean; needsBranchSelection: boolean; roles: WorkerRole[] }>;
  logout: () => Promise<void>;
  workerId: string | null;
  selectRole: (roleData: WorkerRole) => void;
  selectBranch: (branch: Branch | null) => void;
  activeBranch: Branch | null;
  availableRoles: WorkerRole[];
  switchRole: () => void;
  switchBranch: () => void;
  showRoleSelection: boolean;
  showBranchSelection: boolean;
  activeRole: WorkerRole | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const STORAGE_KEY = 'aroma_proma_session';

interface StoredSession {
  workerId: string;
  username: string;
  fullName: string;
  role: AppRole;
  branchId?: string | null;
  branchName?: string | null;
  customRoleCode?: string | null;
  customRoleName?: string | null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    role: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [activeRole, setActiveRole] = useState<WorkerRole | null>(null);
  const [availableRoles, setAvailableRoles] = useState<WorkerRole[]>([]);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [showBranchSelection, setShowBranchSelection] = useState(false);
  const [pendingWorker, setPendingWorker] = useState<Worker | null>(null);

  useEffect(() => {
    // Check for stored session
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const session: StoredSession = JSON.parse(storedSession);
        // Verify the session is still valid by checking the worker exists and is active
        verifyStoredSession(session);
      } catch (error) {
        console.error('Error parsing stored session:', error);
        localStorage.removeItem(STORAGE_KEY);
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const ensureSupabaseSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Failed to create Supabase session:', error);
        throw error;
      }
    }
  };

  const verifyStoredSession = async (session: StoredSession) => {
    try {
      // Ensure we have an auth.uid() so RLS helper functions work
      await ensureSupabaseSession();

      // Bind current auth.uid() to stored workerId (so get_worker_id()/is_admin() work)
      await supabase.rpc('set_worker_session', { p_worker_id: session.workerId });

      const { data: workerData, error } = await supabase
        .from('workers_safe')
        .select('*')
        .eq('id', session.workerId)
        .maybeSingle();

      if (error || !workerData) {
        // Session is invalid, clear it
        localStorage.removeItem(STORAGE_KEY);
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Fetch available roles for this worker
      const { data: rolesData } = await supabase.rpc('get_worker_roles', {
        p_worker_id: session.workerId
      });
      
      if (rolesData) {
        const rawRoles = rolesData as WorkerRole[];
        const seen = new Set<string>();
        const dedupedRoles = rawRoles.filter(r => {
          const key = `${r.role}-${r.branch_id || ''}-${r.custom_role_code || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setAvailableRoles(dedupedRoles);
      }

      // Restore branch if saved
      if (session.branchId) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .eq('id', session.branchId)
          .maybeSingle();
        if (branchData) {
          setActiveBranch(branchData);
        }
      }

      // Restore active role if saved
      if (session.customRoleCode || session.role) {
        const restoredRole: WorkerRole = {
          role: session.role,
          branch_id: session.branchId || null,
          branch_name: session.branchName || null,
          custom_role_code: session.customRoleCode || null,
          custom_role_name: session.customRoleName || null,
        };
        setActiveRole(restoredRole);
      }

      // Session is valid
      setWorkerId(workerData.id);
      setAuthState({
        user: workerData as Worker,
        role: session.role,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error('Error verifying session:', error);
      localStorage.removeItem(STORAGE_KEY);
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const login = async (username: string, password: string) => {
    // Ensure we have an auth.uid() so RLS helper functions work
    await ensureSupabaseSession();

    // Hash the password the same way it was stored
    const passwordHash = btoa(password);
    
    // Verify credentials using the database function
    const { data, error } = await supabase.rpc('verify_worker_password', {
      p_username: username.toLowerCase(),
      p_password_hash: passwordHash,
    });

    if (error) {
      throw new Error('فشل في التحقق من بيانات الدخول');
    }

    if (!data || data.length === 0) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const workerData = data[0];

    // Bind current auth.uid() to this worker so RLS policies can resolve get_worker_id()/is_admin()
    const { error: bindError } = await supabase.rpc('set_worker_session', { p_worker_id: workerData.id });
    if (bindError) {
      console.error('Failed to bind worker session:', bindError);
      throw new Error('فشل تهيئة جلسة المستخدم');
    }

    // Check device lock
    const { data: workerFull } = await supabase
      .from('workers')
      .select('device_locked, last_device_id')
      .eq('id', workerData.id)
      .single();
    
    if ((workerFull as any)?.device_locked && (workerFull as any)?.last_device_id) {
      const currentDeviceId = getDeviceFingerprint();
      if (currentDeviceId !== (workerFull as any).last_device_id) {
        throw new Error('هذا الحساب مقفل على جهاز آخر. تواصل مع المسؤول.');
      }
    }

    // Build worker object from returned data
    const worker: Worker = {
      id: workerData.id,
      username: workerData.username,
      full_name: workerData.full_name,
      role: workerData.role as AppRole,
      branch_id: workerData.branch_id,
      is_active: workerData.is_active,
      created_at: workerData.created_at,
      updated_at: workerData.updated_at,
    };

    // Fetch available roles for this worker
    const { data: rolesData } = await supabase.rpc('get_worker_roles', {
      p_worker_id: worker.id
    });
    
    const rawRoles = (rolesData as WorkerRole[]) || [];
    // Deduplicate roles based on role + branch_id + custom_role_code
    const seen = new Set<string>();
    const roles = rawRoles.filter(r => {
      const key = `${r.role}-${r.branch_id || ''}-${r.custom_role_code || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setAvailableRoles(roles);

    // Check if user has multiple roles
    if (roles.length > 1) {
      setPendingWorker(worker);
      setWorkerId(worker.id);
      setShowRoleSelection(true);
      return { needsRoleSelection: true, needsBranchSelection: false, roles };
    }

    // Single role - check if admin needs branch selection
    const selectedRole: WorkerRole = roles.length === 1 ? roles[0] : { role: worker.role, branch_id: worker.branch_id, branch_name: null };
    
    if (selectedRole.role === 'admin') {
      setPendingWorker(worker);
      setWorkerId(worker.id);
      setActiveRole(selectedRole);
      setAuthState({
        user: worker,
        role: 'admin',
        isLoading: false,
        isAuthenticated: false, // Not fully authenticated until branch is selected
      });
      setShowBranchSelection(true);
      return { needsRoleSelection: false, needsBranchSelection: true, roles };
    }

    // Complete login for non-admin single role
    completeLogin(worker, selectedRole.role, null, selectedRole);
    return { needsRoleSelection: false, needsBranchSelection: false, roles };
  };

  const selectRole = (roleData: WorkerRole) => {
    setShowRoleSelection(false);
    
    if (!pendingWorker) return;

    // Set active role
    setActiveRole(roleData);

    // If admin role selected, show branch selection
    if (roleData.role === 'admin') {
      setAuthState({
        user: pendingWorker,
        role: 'admin',
        isLoading: false,
        isAuthenticated: false,
      });
      setShowBranchSelection(true);
      return;
    }

    // Complete login with selected role
    completeLogin(pendingWorker, roleData.role, roleData.branch_id ? { id: roleData.branch_id, name: roleData.branch_name || '' } as Branch : null, roleData);
  };

  const selectBranch = (branch: Branch | null) => {
    setShowBranchSelection(false);
    
    if (!pendingWorker && !authState.user) return;
    
    const worker = pendingWorker || authState.user;
    if (!worker) return;

    setActiveBranch(branch);
    completeLogin(worker, authState.role || 'admin', branch, activeRole);
  };

  const completeLogin = (worker: Worker, role: AppRole, branch: Branch | null, roleData?: WorkerRole | null) => {
    // Store session
    const session: StoredSession = {
      workerId: worker.id,
      username: worker.username,
      fullName: worker.full_name,
      role: role,
      branchId: branch?.id || null,
      branchName: branch?.name || null,
      customRoleCode: roleData?.custom_role_code || null,
      customRoleName: roleData?.custom_role_name || null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    // Save device fingerprint to worker record (fire and forget)
    try {
      const deviceId = getDeviceFingerprint();
      const deviceInfo = getDeviceInfo();
      supabase
        .from('workers')
        .update({
          last_device_id: deviceId,
          last_device_info: deviceInfo,
        } as any)
        .eq('id', worker.id)
        .then(({ error }) => {
          if (error) console.error('Device info save error:', error);
        });
    } catch (e) {
      console.error('Device fingerprint error:', e);
    }

    setPendingWorker(null);
    setWorkerId(worker.id);
    setActiveBranch(branch);
    if (roleData) {
      setActiveRole(roleData);
    }
    setAuthState({
      user: worker,
      role: role,
      isLoading: false,
      isAuthenticated: true,
    });
  };

  const switchRole = () => {
    if (availableRoles.length > 1) {
      setShowRoleSelection(true);
    }
  };

  const switchBranch = () => {
    if (authState.role === 'admin') {
      setShowBranchSelection(true);
    }
  };

  const logout = async () => {
    localStorage.removeItem(STORAGE_KEY);
    await supabase.auth.signOut();
    setWorkerId(null);
    setActiveBranch(null);
    setActiveRole(null);
    setAvailableRoles([]);
    setPendingWorker(null);
    setShowRoleSelection(false);
    setShowBranchSelection(false);
    setAuthState({
      user: null,
      role: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  return (
    <AuthContext.Provider value={{ 
      ...authState, 
      login, 
      logout, 
      workerId,
      selectRole,
      selectBranch,
      activeBranch,
      activeRole,
      availableRoles,
      switchRole,
      switchBranch,
      showRoleSelection,
      showBranchSelection,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
