'use client';

import { usePathname, useRouter } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';

const shortLabel: Record<Locale, string> = { fa: 'FA', en: 'EN' };

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: Locale) {
    if (next === locale) return;
    const parts = pathname.split('/');
    parts[1] = next;
    router.push(parts.join('/') || `/${next}`);
  }

  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-xs font-semibold">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-pressed={l === locale}
          className={
            l === locale
              ? 'rounded-full bg-brand-500/20 px-2.5 py-1 text-brand-200'
              : 'rounded-full px-2.5 py-1 text-white/50 hover:text-white/80'
          }
        >
          {shortLabel[l]}
        </button>
      ))}
    </div>
  );
}
