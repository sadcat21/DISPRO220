import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye,
  EyeOff,
  Loader2,
  FlaskConical,
  ShieldCheck,
  Building2,
  ScanEye,
  UserRound,
  BriefcaseBusiness,
  Truck,
  Warehouse,
  LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import RoleSelectionDialog from './RoleSelectionDialog';
import BranchSelectionDialog from './BranchSelectionDialog';
import { supabase } from '@/integrations/supabase/client';

interface QuickWorker {
  id?: string;
  username: string;
  full_name: string;
  role: string;
  functional_role?: string | null; // e.g. sales_rep, delivery_rep, warehouse_manager
  branch_id?: string | null;
  branch_name?: string | null;
}

const FUNCTIONAL_ROLE_ICONS: Record<string, LucideIcon> = {
  sales_rep: BriefcaseBusiness,
  delivery_rep: Truck,
  warehouse_manager: Warehouse,
};

const FUNCTIONAL_ROLE_LABEL_AR: Record<string, string> = {
  sales_rep: 'مندوب مبيعات',
  delivery_rep: 'مندوب توصيل',
  warehouse_manager: 'مدير مستودع',
};

const ROLE_ICONS: Record<string, LucideIcon> = {
  admin: ShieldCheck,
  branch_admin: Building2,
  supervisor: ScanEye,
  worker: UserRound,
};

const ROLE_LABEL_AR: Record<string, string> = {
  admin: 'مدير',
  branch_admin: 'مدير فرع',
  supervisor: 'مشرف',
  worker: 'عامل',
};

const getWorkerIcon = (w: QuickWorker) => {
  if (w.functional_role && FUNCTIONAL_ROLE_ICONS[w.functional_role]) {
    return FUNCTIONAL_ROLE_ICONS[w.functional_role];
  }
  return ROLE_ICONS[w.role] || UserRound;
};

const getWorkerIconTone = (w: QuickWorker, isRealMode: boolean) => {
  if (isRealMode) {
    return 'text-red-600';
  }

  if (w.functional_role === 'delivery_rep') return 'text-blue-600';
  if (w.functional_role === 'sales_rep') return 'text-violet-600';
  if (w.functional_role === 'warehouse_manager') return 'text-amber-600';
  if (w.role === 'admin') return 'text-rose-600';
  if (w.role === 'branch_admin') return 'text-emerald-600';
  if (w.role === 'supervisor') return 'text-sky-600';
  return 'text-slate-600';
};

const getWorkerLabel = (w: QuickWorker) => {
  const base = ROLE_LABEL_AR[w.role] || w.role;
  if (w.functional_role && FUNCTIONAL_ROLE_LABEL_AR[w.functional_role]) {
    return `${base} - ${FUNCTIONAL_ROLE_LABEL_AR[w.functional_role]}`;
  }
  return base;
};

const ADMIN_TAB_ROLES = ['admin', 'project_manager', 'accountant', 'admin_assistant'];

const LoginForm: React.FC = () => {
  const { login, selectRole, selectBranch, showRoleSelection, showBranchSelection, availableRoles } = useAuth();
  const { t, dir } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Quick login: 'test' for test workers, 'real' for real workers
  const [quickLoginMode, setQuickLoginMode] = useState<'none' | 'test' | 'real'>('none');
  
  // Tap counters for logo (real) and title (test)
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [titleTapCount, setTitleTapCount] = useState(0);
  const titleTapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [testWorkers, setTestWorkers] = useState<QuickWorker[]>([]);
  const [realWorkers, setRealWorkers] = useState<QuickWorker[]>([]);
  const [realQuickTab, setRealQuickTab] = useState('admins');
  const isQuickLoginOpen = quickLoginMode !== 'none';
  const quickWorkers = quickLoginMode === 'test' ? testWorkers : realWorkers;

  useEffect(() => {
    if (quickLoginMode === 'test' && testWorkers.length === 0) {
      fetchWorkers(true);
    }
    if (quickLoginMode === 'real' && realWorkers.length === 0) {
      fetchWorkers(false);
    }
  }, [quickLoginMode]);

  useEffect(() => {
    if (quickLoginMode !== 'real') return;
    setRealQuickTab('admins');
  }, [quickLoginMode]);

  const fetchWorkers = async (isTest: boolean) => {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, username, full_name, role, branch_id')
      .eq('is_test', isTest)
      .eq('is_active', true)
      .order('role')
      .order('full_name');
    if (!workers) return;

    // Fetch functional roles for these workers
    const workerIds = workers.map(w => w.id);
    const { data: roles } = await supabase
      .from('worker_roles')
      .select('worker_id, custom_role_id, custom_roles(code)')
      .in('worker_id', workerIds)
      .not('custom_role_id', 'is', null);

    const funcRoleMap: Record<string, string> = {};
    if (roles) {
      for (const r of roles as any[]) {
        if (r.custom_roles?.code) {
          funcRoleMap[r.worker_id] = r.custom_roles.code;
        }
      }
    }

    const branchIds = [...new Set(workers.map((w) => w.branch_id).filter(Boolean))];
    const branchMap: Record<string, string> = {};
    if (branchIds.length > 0) {
      const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .in('id', branchIds);

      if (branches) {
        for (const branch of branches) {
          branchMap[branch.id] = branch.name;
        }
      }
    }

    const result: QuickWorker[] = workers.map(w => ({
      id: w.id,
      username: w.username,
      full_name: w.full_name,
      role: w.role,
      functional_role: funcRoleMap[w.id] || null,
      branch_id: w.branch_id || null,
      branch_name: w.branch_id ? branchMap[w.branch_id] || null : null,
    }));

    if (isTest) setTestWorkers(result);
    else setRealWorkers(result);
  };

  const adminQuickWorkers = realWorkers.filter((worker) => ADMIN_TAB_ROLES.includes(worker.role) || !worker.branch_id);
  const branchQuickTabs = [...new Map(
    realWorkers
      .filter((worker) => worker.branch_id && worker.branch_name)
      .map((worker) => [worker.branch_id, { id: worker.branch_id!, name: worker.branch_name! }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const renderQuickWorkerCard = (worker: QuickWorker, isRealMode: boolean) => {
    const WorkerIcon = getWorkerIcon(worker);

    return (
      <button
        key={worker.id || worker.username}
        type="button"
        disabled={isLoading}
        onClick={() => doLogin(worker.username, worker.username, true)}
        className={`group flex min-h-[168px] flex-col items-center text-center transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          isRealMode
            ? 'justify-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-5 hover:border-red-300 hover:bg-red-50/40'
            : 'justify-between rounded-2xl border-2 border-slate-200 bg-white px-3 py-4 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md'
        }`}
      >
        <div className={`flex h-14 w-14 items-center justify-center text-2xl ring-1 ${
          isRealMode
            ? 'rounded-xl bg-red-50 ring-red-100'
            : 'rounded-2xl bg-slate-100 ring-slate-200'
        }`}>
          <WorkerIcon className={`h-7 w-7 ${getWorkerIconTone(worker, isRealMode)}`} strokeWidth={2.2} />
        </div>
        <div className="space-y-1">
          <div className="line-clamp-2 text-base font-bold leading-6 text-slate-800">
            {worker.full_name}
          </div>
          <div className="line-clamp-2 text-xs leading-5 text-slate-500">
            {getWorkerLabel(worker)}
          </div>
          {isRealMode && worker.branch_name && (
            <div className="text-[11px] font-medium text-red-500">
              {worker.branch_name}
            </div>
          )}
        </div>
        {!isRealMode && (
          <div className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors group-hover:bg-slate-200">
            دخول
          </div>
        )}
      </button>
    );
  };

  // Logo tap â†’ real workers
  const handleLogoTap = () => {
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    if (newCount >= 3) {
      setQuickLoginMode(prev => prev === 'real' ? 'none' : 'real');
      setLogoTapCount(0);
      return;
    }
    logoTapTimer.current = setTimeout(() => setLogoTapCount(0), 800);
  };

  // Title tap â†’ test workers
  const handleTitleTap = () => {
    const newCount = titleTapCount + 1;
    setTitleTapCount(newCount);
    if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    if (newCount >= 3) {
      setQuickLoginMode(prev => prev === 'test' ? 'none' : 'test');
      setTitleTapCount(0);
      return;
    }
    titleTapTimer.current = setTimeout(() => setTitleTapCount(0), 800);
  };

  const doLogin = async (user: string, pass: string, isQuickLogin = false) => {
    setIsLoading(true);
    try {
      const result = await login(user.trim(), pass);
      if (!result.needsRoleSelection && !result.needsBranchSelection) {
        if (isQuickLogin) setQuickLoginMode('none');
        toast.success(t('auth.login') + ' âœ“');
      }
    } catch (error: any) {
      // For quick login, try alternative password casings
      if (isQuickLogin) {
        const alternatives = [
          pass.charAt(0).toUpperCase() + pass.slice(1), // Capitalized
          pass.toUpperCase(), // ALL CAPS
        ].filter(alt => alt !== pass);
        for (const alt of alternatives) {
          try {
            const result = await login(user.trim(), alt);
            if (!result.needsRoleSelection && !result.needsBranchSelection) {
              setQuickLoginMode('none');
              toast.success(t('auth.login') + ' âœ“');
            }
            return;
          } catch {
            // try next alternative
          }
        }
      }
      console.error('Login error:', error);
      toast.error(error.message || t('auth.invalid_credentials'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error(t('auth.fill_all_fields'));
      return;
    }
    await doLogin(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-secondary" dir={dir}>
      <Card className="w-full max-w-sm glass-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-28 h-28 cursor-pointer select-none" onClick={handleLogoTap}>
            <img src={logo} alt="Laser Food Logo" className="w-full h-full object-contain" draggable={false} />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold cursor-pointer select-none" onClick={handleTitleTap}>{t('app.name')}</CardTitle>
            <CardDescription>{t('app.description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.username')}</Label>
              <Input
                id="username"
                type="text"
                placeholder={t('auth.enter_username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.enter_password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-10"
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-red-600 text-white hover:bg-red-700" 
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 ms-2 animate-spin" />
                  {t('auth.logging_in')}
                </>
              ) : (
                t('auth.login')
              )}
            </Button>
          </form>

      <Dialog open={isQuickLoginOpen} onOpenChange={(open) => setQuickLoginMode(open ? quickLoginMode : 'none')}>
        <DialogContent className="max-w-md border-0 bg-white/95 p-0 shadow-2xl backdrop-blur" dir={dir}>
          <DialogHeader className={`border-b border-slate-200 px-6 py-5 text-white ${quickLoginMode === 'test' ? 'bg-gradient-to-l from-purple-600 via-fuchsia-600 to-rose-500' : 'bg-red-600'}`}>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              {quickLoginMode === 'test' ? <FlaskConical className="h-5 w-5" /> : <span className="text-lg">🔑</span>}
              {quickLoginMode === 'test' ? 'دخول سريع تجريبي' : 'دخول سريع حقيقي'}
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-white/85">
              اختر العامل للدخول بلمسة واحدة عبر نافذة أوضح وأكثر جاذبية.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
            {quickWorkers.length > 0 ? (
              quickLoginMode === 'real' ? (
                <Tabs value={realQuickTab} onValueChange={setRealQuickTab} dir={dir}>
                  <TabsList className="mb-4 h-auto w-full justify-start gap-2 rounded-xl bg-slate-100 p-1">
                    <TabsTrigger value="admins" className="rounded-lg px-3 text-xs data-[state=active]:bg-white data-[state=active]:text-red-600">
                      الإداريون
                    </TabsTrigger>
                    {branchQuickTabs.map((branch) => (
                      <TabsTrigger
                        key={branch.id}
                        value={branch.id}
                        className="rounded-lg px-3 text-xs data-[state=active]:bg-white data-[state=active]:text-red-600"
                      >
                        {branch.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="admins" className="mt-0">
                    {adminQuickWorkers.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {adminQuickWorkers.map((worker) => renderQuickWorkerCard(worker, true))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        لا يوجد حسابات إدارية مفعّلة حاليًا.
                      </div>
                    )}
                  </TabsContent>

                  {branchQuickTabs.map((branch) => {
                    const branchWorkers = realWorkers.filter((worker) => worker.branch_id === branch.id);
                    return (
                      <TabsContent key={branch.id} value={branch.id} className="mt-0 space-y-3">
                        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                          {branch.name} - مدير الفرع والعمال
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {branchWorkers.map((worker) => renderQuickWorkerCard(worker, true))}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {quickWorkers.map((worker) => renderQuickWorkerCard(worker, false))}
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {quickLoginMode === 'test'
                  ? 'لا يوجد عمال تجريبيون حاليًا.'
                  : 'لا يوجد عمال مفعّلون للدخول السريع حاليًا.'}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
        </CardContent>
      </Card>

      {/* Role Selection Dialog */}
      <RoleSelectionDialog
        open={showRoleSelection}
        roles={availableRoles}
        onSelectRole={(roleData) => {
          selectRole(roleData);
          toast.success(t('auth.login') + ' âœ“');
        }}
      />

      {/* Branch Selection Dialog */}
      <BranchSelectionDialog
        open={showBranchSelection}
        onSelectBranch={(branch) => {
          selectBranch(branch);
          toast.success(t('auth.login') + ' âœ“');
        }}
      />
    </div>
  );
};

export default LoginForm;

