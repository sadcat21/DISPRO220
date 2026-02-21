import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';

const PrintSettingsCard: React.FC = () => {
  const { t, printLanguage, setPrintLanguage } = useLanguage();
  const { activeBranch } = useAuth();

  const handlePrintLanguageChange = (value: 'ar' | 'fr' | 'en') => {
    setPrintLanguage(value, activeBranch?.id || null);
    toast.success(t('print_settings.saved'));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Printer className="w-5 h-5" />
          {t('print_settings.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Print Language */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('print_settings.language')}</label>
          <Select value={printLanguage} onValueChange={handlePrintLanguageChange}>
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
          <p className="text-xs text-muted-foreground">
            {t('print_settings.language_desc')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PrintSettingsCard;
