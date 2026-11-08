import type { Locale } from '@/i18n/config';

const intlLocale: Record<Locale, string> = { fa: 'fa-IR', en: 'en-US' };

export function formatCurrency(
  amount: number,
  locale: Locale = 'en',
  currency = 'USD',
): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function formatNumber(
  value: number,
  locale: Locale = 'en',
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale[locale], opts).format(value);
}

export function formatPercent(value: number, locale: Locale = 'en'): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    maximumFractionDigits: 2,
  }).format(value) + '٪'.normalize();
}

export function formatDate(
  date: Date | string,
  locale: Locale = 'en',
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

// Convert ASCII digits in a string to Persian digits (for fa UI).
const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export function toFaDigits(input: string | number, locale: Locale): string {
  const s = String(input);
  if (locale !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => persianDigits[Number(d)]);
}
