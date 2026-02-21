import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from '@/i18n/translations';
import { supabase } from '@/integrations/supabase/client';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
  // Print settings
  printLanguage: Language;
  setPrintLanguage: (lang: Language, branchId?: string | null) => void;
  tp: (key: string) => string; // translate for print
  printDir: 'rtl' | 'ltr';
  loadPrintSettingsFromDB: (branchId?: string | null) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

const LANGUAGE_KEY = 'laser_food_language';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('ar');
  const [printLanguage, setPrintLanguageState] = useState<Language>('fr');

  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_KEY) as Language | null;
    if (stored && (stored === 'ar' || stored === 'fr' || stored === 'en')) {
      setLanguageState(stored);
      updateDocumentDirection(stored);
    } else {
      updateDocumentDirection('ar');
    }
  }, []);

  const loadPrintSettingsFromDB = async (branchId?: string | null) => {
    try {
      let query = supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'print_language');
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      } else {
        query = query.is('branch_id', null);
      }

      const { data } = await query.maybeSingle();
      
      if (data && (data.value === 'ar' || data.value === 'fr' || data.value === 'en')) {
        setPrintLanguageState(data.value as Language);
      } else if (branchId) {
        // Fallback to global setting
        const { data: globalData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'print_language')
          .is('branch_id', null)
          .maybeSingle();
        
        if (globalData && (globalData.value === 'ar' || globalData.value === 'fr' || globalData.value === 'en')) {
          setPrintLanguageState(globalData.value as Language);
        }
      }
    } catch (error) {
      console.error('Error loading print settings:', error);
    }
  };

  const updateDocumentDirection = (lang: Language) => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_KEY, lang);
    updateDocumentDirection(lang);
  };

  const setPrintLanguage = async (lang: Language, branchId?: string | null) => {
    setPrintLanguageState(lang);
    
    try {
      const upsertData: any = {
        key: 'print_language',
        value: lang,
        branch_id: branchId || null,
        updated_at: new Date().toISOString(),
      };

      // Try upsert
      const { error } = await supabase
        .from('app_settings')
        .upsert(upsertData, { onConflict: 'branch_id,key' });

      if (error) {
        console.error('Error saving print language:', error);
      }
    } catch (error) {
      console.error('Error saving print language:', error);
    }
  };

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }
    return translation[language];
  };

  const tp = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }
    return translation[printLanguage];
  };

  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const printDir = printLanguage === 'ar' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage, 
      t, 
      dir,
      printLanguage,
      setPrintLanguage,
      tp,
      printDir,
      loadPrintSettingsFromDB
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export type { Language } from '@/i18n/translations';
