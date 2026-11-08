export const locales = ['fa', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fa';

export const localeDir: Record<Locale, 'rtl' | 'ltr'> = {
  fa: 'rtl',
  en: 'ltr',
};

export const localeNames: Record<Locale, string> = {
  fa: 'فارسی',
  en: 'English',
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
