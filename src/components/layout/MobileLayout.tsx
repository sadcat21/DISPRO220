import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, MoreHorizontal, Bluetooth, BluetoothOff, Printer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import icon from '@/assets/icon.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import BranchSelectionDialog from '@/components/auth/BranchSelectionDialog';
import OffersNotification from '@/components/offers/OffersNotification';
import StockAlertsNotification from '@/components/stock/StockAlertsNotification';
import TasksPopover from '@/components/tasks/TasksPopover';
import RequestsPopover from '@/components/tasks/RequestsPopover';
import DebtCollectionsPopover from '@/components/debts/DebtCollectionsPopover';
import SectorCustomersPopover from '@/components/sectors/SectorCustomersPopover';
import ReceiptModificationsNotification from '@/components/printing/ReceiptModificationsNotification';
import { ALGERIAN_WILAYAS } from '@/data/algerianWilayas';
import { useNavigation } from '@/hooks/useNavigation';
import { useNavbarPreferences } from '@/hooks/useNavbarPreferences';
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';

interface MobileLayoutProps {
  children: React.ReactNode;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({ children }) => {
  const { role, user, logout, activeBranch, switchBranch, showBranchSelection, selectBranch, activeRole } = useAuth();
  const { t, dir, language, setLanguage } = useLanguage();
  const location = useLocation();
  const { isConnected, deviceName, scanAndConnect, disconnect, status: printerStatus } = useBluetoothPrinter();

  const LANGUAGES: { code: Language; label: string; flag: string }[] = [
    { code: 'ar', label: 'العربية', flag: '🇩🇿' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
  ];
  const { main: defaultMainItems, more: defaultMoreItems } = useNavigation();
  const { tabPaths } = useNavbarPreferences();

  // Apply navbar preferences: if user has custom tabs, use them for main nav
  const allNavItems = [...defaultMainItems, ...defaultMoreItems];
  const homeItem = defaultMainItems.find(i => i.path === '/');
  
  let mainNavItems = defaultMainItems;
  let moreNavItems = defaultMoreItems;

  if (tabPaths && tabPaths.length > 0) {
    const customMain = tabPaths
      .map(path => allNavItems.find(i => i.path === path))
      .filter(Boolean) as typeof allNavItems;
    mainNavItems = homeItem ? [homeItem, ...customMain] : customMain;
    // More = everything not in main (excluding home)
    const mainPaths = new Set(mainNavItems.map(i => i.path));
    moreNavItems = allNavItems.filter(i => i.path !== '/' && !mainPaths.has(i.path));
  }

  const isMoreActive = moreNavItems.some(item => location.pathname === item.path);

  // Get role display text
  const getRoleDisplayText = () => {
    const parts: string[] = [];
    
    // Add system role (صفة)
    if (role === 'admin') {
      parts.push(t('workers.role_admin'));
    } else if (role === 'branch_admin') {
      parts.push(t('workers.role_branch_admin'));
    } else if (role === 'supervisor') {
      parts.push(t('workers.role_supervisor'));
    } else if (role === 'worker') {
      parts.push(t('workers.role_worker'));
    }
    
    // Add functional role (دور وظيفي) if available
    if (activeRole?.custom_role_name) {
      parts.push(activeRole.custom_role_name);
    }
    
    return parts.join(' - ');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={dir}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-secondary text-secondary-foreground safe-top">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 shrink-0">
              <img src={icon} alt="Laser Food Icon" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm leading-tight">Laser Food</h1>
              <p className="text-[10px] text-muted-foreground truncate">
                {user?.full_name}
              </p>
              {getRoleDisplayText() && (
                <p className="text-[10px] text-primary font-medium truncate">
                  {getRoleDisplayText()}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <RequestsPopover />
            <TasksPopover />
            <SectorCustomersPopover />
            <DebtCollectionsPopover />
            <ReceiptModificationsNotification />
            <StockAlertsNotification />
            <OffersNotification />
            
            {/* More actions dropdown: Language, Branch, Logout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                  <MoreHorizontal className="w-4 h-4 text-primary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {/* Language options */}
                {LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer',
                      language === lang.code && 'bg-primary/10 text-primary font-semibold'
                    )}
                  >
                    <span>{lang.flag}</span>
                    <span className="text-sm">{lang.label}</span>
                  </DropdownMenuItem>
                ))}
                {/* Printer connection */}
                <DropdownMenuSeparator />
                {isConnected ? (
                  <>
                    <DropdownMenuItem className="flex items-center gap-2 text-green-600 cursor-default">
                      <Printer className="w-4 h-4" />
                      <span className="text-sm truncate">{deviceName || 'طابعة متصلة'}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={disconnect}
                      className="flex items-center gap-2 cursor-pointer text-destructive"
                    >
                      <BluetoothOff className="w-4 h-4" />
                      <span className="text-sm">قطع الاتصال</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onClick={scanAndConnect}
                    className="flex items-center gap-2 cursor-pointer"
                    disabled={printerStatus === 'connecting'}
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span className="text-sm">{printerStatus === 'connecting' ? 'جاري الاتصال...' : 'ربط الطابعة'}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                
                {/* Branch selector for admin */}
                {role === 'admin' && (
                  <DropdownMenuItem
                    onClick={switchBranch}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <span className="text-sm font-bold text-primary">
                      {activeBranch 
                        ? ALGERIAN_WILAYAS.find(w => w.name === activeBranch.wilaya)?.code || '∞'
                        : '∞'}
                    </span>
                    <span className="text-sm">{activeBranch ? activeBranch.name : t('branches.all_branches')}</span>
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuItem
                  onClick={logout}
                  className="flex items-center gap-2 cursor-pointer text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">{t('auth.logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-secondary border-t border-border safe-bottom z-50">
        <div className="flex items-center justify-around py-2">
          {mainNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors',
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
          
          {/* More Menu for Admin and Branch Admin */}
          {moreNavItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors',
                    isMoreActive
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MoreHorizontal className="w-5 h-5" />
                  <span className="text-xs font-medium">{t('nav.more')}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-48 mb-2">
                {moreNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <DropdownMenuItem key={item.path} asChild>
                      <Link
                        to={item.path}
                        className={cn(
                          'flex items-center gap-3 w-full cursor-pointer',
                          isActive && 'text-primary font-semibold'
                        )}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </nav>

      {/* Branch Selection Dialog */}
      <BranchSelectionDialog
        open={showBranchSelection}
        onSelectBranch={selectBranch}
      />
    </div>
  );
};

export default MobileLayout;