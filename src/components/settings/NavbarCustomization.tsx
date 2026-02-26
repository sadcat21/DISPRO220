import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Navigation, RotateCcw, Save, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigation, NavItem } from '@/hooks/useNavigation';
import { useNavbarPreferences } from '@/hooks/useNavbarPreferences';
import { toast } from 'sonner';

const MAX_TABS = 8;

const NavbarCustomization: React.FC = () => {
  const { t } = useLanguage();
  const { main, more } = useNavigation();
  const { tabPaths, savePreferences } = useNavbarPreferences();
  const [selected, setSelected] = useState<string[]>([]);

  // All available items (excluding home which is always shown)
  const allItems: NavItem[] = [...main, ...more].filter(item => item.path !== '/');

  useEffect(() => {
    if (tabPaths && tabPaths.length > 0) {
      setSelected(tabPaths);
    } else {
      // Default: first items from main nav (excluding home)
      setSelected(main.filter(i => i.path !== '/').map(i => i.path));
    }
  }, [tabPaths, main]);

  const toggleItem = (path: string) => {
    setSelected(prev => {
      if (prev.includes(path)) return prev.filter(p => p !== path);
      if (prev.length >= MAX_TABS) {
        toast.error(t('settings.max_tabs_reached'));
        return prev;
      }
      return [...prev, path];
    });
  };

  const handleSave = async () => {
    try {
      await savePreferences.mutateAsync(selected);
      toast.success(t('common.saved'));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReset = () => {
    setSelected(main.filter(i => i.path !== '/').map(i => i.path));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Navigation className="w-5 h-5" />
          {t('settings.navbar_customization')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t('settings.navbar_description')} ({selected.length}/{MAX_TABS})
        </p>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {allItems.map(item => (
            <label
              key={item.path}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(item.path)}
                onCheckedChange={() => toggleItem(item.path)}
              />
              <item.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{item.label}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" className="flex-1" onClick={handleSave} disabled={savePreferences.isPending}>
            {savePreferences.isPending ? <Loader2 className="w-4 h-4 animate-spin ms-1" /> : <Save className="w-4 h-4 ms-1" />}
            {t('common.save')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 ms-1" />
            {t('settings.reset_default')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default NavbarCustomization;
