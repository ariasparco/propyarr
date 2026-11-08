import type { Locale } from '@/i18n/config';

// Build a locale-prefixed path, e.g. path('fa', '/plans') => '/fa/plans'.
export function path(locale: Locale | string, p = '/'): string {
  const clean = p === '/' ? '' : p.startsWith('/') ? p : `/${p}`;
  return `/${locale}${clean}`;
}
