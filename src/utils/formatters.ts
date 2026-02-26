import { format, type Locale } from 'date-fns';
import { ar } from 'date-fns/locale';
import { fr } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { Language } from '@/i18n/translations';

const localeMap: Record<Language, Locale> = {
  ar,
  fr,
  en: enUS,
};

const numberLocaleMap: Record<Language, string> = {
  ar: 'ar-DZ',
  fr: 'fr-FR',
  en: 'en-US',
};

/**
 * Format a date string based on the current language.
 */
export const formatDate = (
  date: string | Date,
  pattern: string,
  language: Language
): string => {
  return format(new Date(date), pattern, { locale: localeMap[language] });
};

/**
 * Format a number based on the current language.
 */
export const formatNumber = (
  value: number,
  language: Language
): string => {
  return value.toLocaleString(numberLocaleMap[language]);
};

/**
 * Format a currency amount, rounding to avoid long decimals.
 */
export const formatAmount = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === Math.floor(rounded)) return rounded.toLocaleString();
  return rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
