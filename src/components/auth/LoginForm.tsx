import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import RoleSelectionDialog from './RoleSelectionDialog';
import BranchSelectionDialog from './BranchSelectionDialog';
import { supabase } from '@/integrations/supabase/client';

interface TestWorkerQuick {
  username: string;
  full_name: string;
  role: string;
}

const ROLE_EMOJI: Record<string, string> = {
  admin: '🔑',
  branch_admin: '🏢',
  supervisor: '👁️',
  worker: '🚚',
};

const ROLE_LABEL_AR: Record<string, string> = {
  admin: 'مدير',
  branch_admin: 'مدير فرع',
  supervisor: 'مشرف',
  worker: 'عامل',
};

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
  
  const [testWorkers, setTestWorkers] = useState<TestWorkerQuick[]>([]);
  const [realWorkers, setRealWorkers] = useState<TestWorkerQuick[]>([]);

  useEffect(() => {
    if (quickLoginMode === 'test' && testWorkers.length === 0) {
      fetchTestWorkers();
    }
    if (quickLoginMode === 'real' && realWorkers.length === 0) {
      fetchRealWorkers();
    }
  }, [quickLoginMode]);

  const fetchTestWorkers = async () => {
    const { data } = await supabase
      .from('workers')
      .select('username, full_name, role')
      .eq('is_test', true)
      .eq('is_active', true)
      .order('role')
      .order('full_name');
    if (data) setTestWorkers(data as TestWorkerQuick[]);
  };

  const fetchRealWorkers = async () => {
    const { data } = await supabase
      .from('workers')
      .select('username, full_name, role')
      .eq('is_test', false)
      .eq('is_active', true)
      .order('role')
      .order('full_name');
    if (data) setRealWorkers(data as TestWorkerQuick[]);
  };

  // Logo tap → real workers
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

  // Title tap → test workers
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

  const doLogin = async (user: string, pass: string) => {
    setIsLoading(true);
    try {
      const result = await login(user.trim(), pass);
      if (!result.needsRoleSelection && !result.needsBranchSelection) {
        toast.success(t('auth.login') + ' ✓');
      }
    } catch (error: any) {
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
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90" 
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

          {/* Test workers quick login */}
          {quickLoginMode === 'test' && <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2 flex items-center justify-center gap-1">
              <FlaskConical className="w-3 h-3" />
              دخول سريع (تجريبي)
            </p>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              {testWorkers.length > 0 ? (
                testWorkers.map((tw) => (
                  <Button
                    key={tw.username}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs justify-start"
                    disabled={isLoading}
                    onClick={() => doLogin(tw.username, tw.username)}
                  >
                    {ROLE_EMOJI[tw.role] || '👤'} {tw.full_name}
                    <span className="text-muted-foreground mr-auto text-[10px]">
                      ({ROLE_LABEL_AR[tw.role] || tw.role})
                    </span>
                  </Button>
                ))
              ) : (
                <p className="text-xs text-center text-muted-foreground py-2">
                  لا يوجد عمال تجريبيون. أنشئهم من إدارة العمال.
                </p>
              )}
            </div>
          </div>}

          {/* Real workers quick login */}
          {quickLoginMode === 'real' && <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2">🔑 دخول سريع (حقيقي)</p>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              {realWorkers.map((tw) => (
                <Button
                  key={tw.username}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs justify-start"
                  disabled={isLoading}
                  onClick={() => { setUsername(tw.username); }}
                >
                  {ROLE_EMOJI[tw.role] || '👤'} {tw.full_name}
                  <span className="text-muted-foreground mr-auto text-[10px]">
                    ({ROLE_LABEL_AR[tw.role] || tw.role})
                  </span>
                </Button>
              ))}
            </div>
          </div>}
        </CardContent>
      </Card>

      {/* Role Selection Dialog */}
      <RoleSelectionDialog
        open={showRoleSelection}
        roles={availableRoles}
        onSelectRole={(roleData) => {
          selectRole(roleData);
          toast.success(t('auth.login') + ' ✓');
        }}
      />

      {/* Branch Selection Dialog */}
      <BranchSelectionDialog
        open={showBranchSelection}
        onSelectBranch={(branch) => {
          selectBranch(branch);
          toast.success(t('auth.login') + ' ✓');
        }}
      />
    </div>
  );
};

export default LoginForm;