import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import RoleSelectionDialog from './RoleSelectionDialog';
import BranchSelectionDialog from './BranchSelectionDialog';

const LoginForm: React.FC = () => {
  const { login, selectRole, selectBranch, showRoleSelection, showBranchSelection, availableRoles } = useAuth();
  const { t, dir } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickLogin, setShowQuickLogin] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (newCount >= 3) {
      setShowQuickLogin(prev => !prev);
      setTapCount(0);
      return;
    }
    tapTimer.current = setTimeout(() => setTapCount(0), 800);
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
          <div className="mx-auto w-28 h-28 cursor-pointer select-none" onClick={handleSecretTap}>
            <img src={logo} alt="Laser Food Logo" className="w-full h-full object-contain" draggable={false} />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">{t('app.name')}</CardTitle>
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

          {showQuickLogin && <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2">دخول سريع</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                disabled={isLoading}
                onClick={() => doLogin('hssm0909', 'hssm0909')}
              >
                🔑 مدير النظام
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  disabled={isLoading}
                  onClick={() => doLogin('Hicham27', 'Hicham27')}
                >
                  🚚 هشام (توصيل)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  disabled={isLoading}
                  onClick={() => doLogin('zinou27', 'zinou27')}
                >
                  📊 زينو (مبيعات)
                </Button>
              </div>
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