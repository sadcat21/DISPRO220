/**
 * Returns the appropriate name for a sector or zone based on current language.
 * Uses name_fr when language is not Arabic, falls back to name.
 */
export const getLocalizedName = (
  item: { name: string; name_fr?: string | null },
  language: string
): string => {
  if (language !== 'ar' && item.name_fr) {
    return item.name_fr;
  }
  return item.name;
};
