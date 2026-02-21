import { Language } from '@/i18n/translations';

/**
 * Get the category name in the current language, with fallback to Arabic then the `name` field.
 */
export const getCategoryName = (
  category: { name: string; name_fr?: string | null; name_en?: string | null } | undefined | null,
  language: Language
): string => {
  if (!category) return '';

  switch (language) {
    case 'fr':
      return category.name_fr || category.name;
    case 'en':
      return category.name_en || category.name;
    default:
      return category.name;
  }
};
