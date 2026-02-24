import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Languages, Loader2, Type, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export type TranslationMode = 'transliterate' | 'translate';

interface TranslatableInputProps {
  valueAr: string;
  valueFr: string;
  valueEn: string;
  onChangeAr: (val: string) => void;
  onChangeFr: (val: string) => void;
  onChangeEn: (val: string) => void;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  defaultMode?: TranslationMode;
}

const TranslatableInput: React.FC<TranslatableInputProps> = ({
  valueAr, valueFr, valueEn,
  onChangeAr, onChangeFr, onChangeEn,
  label, placeholder, multiline = false, required = false,
  defaultMode = 'transliterate',
}) => {
  const { t } = useLanguage();
  const [translating, setTranslating] = useState(false);
  const [mode, setMode] = useState<TranslationMode>(defaultMode);

  const detectSourceAndTranslate = async () => {
    let sourceLang = '';
    let sourceText = '';
    const targetLangs: string[] = [];

    if (valueAr.trim()) {
      sourceLang = 'ar';
      sourceText = valueAr.trim();
    } else if (valueFr.trim()) {
      sourceLang = 'fr';
      sourceText = valueFr.trim();
    } else if (valueEn.trim()) {
      sourceLang = 'en';
      sourceText = valueEn.trim();
    }

    if (!sourceText) {
      toast.error(t('translation.enter_text_first'));
      return;
    }

    if (sourceLang !== 'ar' && !valueAr.trim()) targetLangs.push('ar');
    if (sourceLang !== 'fr' && !valueFr.trim()) targetLangs.push('fr');
    if (sourceLang !== 'en' && !valueEn.trim()) targetLangs.push('en');

    if (targetLangs.length === 0) {
      toast.info(t('translation.all_filled'));
      return;
    }

    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text: sourceText, sourceLang, targetLangs, mode },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const translations = data.translations as Record<string, string>;

      if (translations.ar && targetLangs.includes('ar')) onChangeAr(translations.ar);
      if (translations.fr && targetLangs.includes('fr')) onChangeFr(translations.fr);
      if (translations.en && targetLangs.includes('en')) onChangeEn(translations.en);

      toast.success(t('translation.success'));
    } catch (err: any) {
      console.error('Translation error:', err);
      toast.error(t('translation.failed'));
    } finally {
      setTranslating(false);
    }
  };

  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6 shrink-0">🇩🇿</span>
          <InputComponent
            value={valueAr}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeAr(e.target.value)}
            placeholder={placeholder ? `${placeholder} (عربي)` : 'عربي'}
            dir="rtl"
            required={required}
            className="flex-1"
            rows={multiline ? 2 : undefined}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6 shrink-0">🇫🇷</span>
          <InputComponent
            value={valueFr}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeFr(e.target.value)}
            placeholder={placeholder ? `${placeholder} (Français)` : 'Français'}
            dir="ltr"
            className="flex-1"
            rows={multiline ? 2 : undefined}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6 shrink-0">🇺🇸</span>
          <InputComponent
            value={valueEn}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeEn(e.target.value)}
            placeholder={placeholder ? `${placeholder} (English)` : 'English'}
            dir="ltr"
            className="flex-1"
            rows={multiline ? 2 : undefined}
          />
        </div>
      </div>

      {/* Mode toggle + translate button */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-input overflow-hidden flex-1">
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1.5 text-xs flex-1 transition-colors ${
              mode === 'transliterate'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => setMode('transliterate')}
          >
            <Type className="w-3 h-3" />
            {t('translation.transliterate')}
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1.5 text-xs flex-1 transition-colors ${
              mode === 'translate'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => setMode('translate')}
          >
            <BookOpen className="w-3 h-3" />
            {t('translation.meaning')}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={detectSourceAndTranslate}
          disabled={translating}
          className="shrink-0"
        >
          {translating ? (
           <Loader2 className="w-4 h-4 animate-spin me-1" />
          ) : (
            <Languages className="w-4 h-4 me-1" />
          )}
          {t('translation.translate')}
        </Button>
      </div>
    </div>
  );
};

// Helper: auto-translate empty fields before saving
export const autoTranslateBeforeSave = async (
  ar: string, fr: string, en: string, mode: TranslationMode = 'transliterate'
): Promise<{ ar: string; fr: string; en: string }> => {
  const result = { ar, fr, en };
  
  let sourceLang = '';
  let sourceText = '';
  const targetLangs: string[] = [];

  if (ar.trim()) {
    sourceLang = 'ar'; sourceText = ar.trim();
  } else if (fr.trim()) {
    sourceLang = 'fr'; sourceText = fr.trim();
  } else if (en.trim()) {
    sourceLang = 'en'; sourceText = en.trim();
  }

  if (!sourceText) return result;

  if (sourceLang !== 'ar' && !ar.trim()) targetLangs.push('ar');
  if (sourceLang !== 'fr' && !fr.trim()) targetLangs.push('fr');
  if (sourceLang !== 'en' && !en.trim()) targetLangs.push('en');

  if (targetLangs.length === 0) return result;

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { text: sourceText, sourceLang, targetLangs, mode },
    });

    if (error || data?.error) return result;

    const translations = data.translations as Record<string, string>;
    if (translations.ar && targetLangs.includes('ar')) result.ar = translations.ar;
    if (translations.fr && targetLangs.includes('fr')) result.fr = translations.fr;
    if (translations.en && targetLangs.includes('en')) result.en = translations.en;
  } catch {
    // Silent fail - return what we have
  }

  return result;
};

export default TranslatableInput;
