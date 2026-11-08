import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { defaultLocale } from '@/i18n/config';
import { path } from '@/lib/routes';

// Locale-scoped 404 — rendered inside the [locale] layout (fonts, dir, chrome).
export default function LocaleNotFound() {
  const dict = getDictionary(defaultLocale);
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-8xl font-extrabold text-brand-400">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-white">
        {dict.notFound.title}
      </h1>
      <p className="mt-2 max-w-md text-white/50">{dict.notFound.description}</p>
      <Link
        href={path(defaultLocale, '/')}
        className="mt-8 rounded-xl bg-brand-500 px-7 py-3 font-semibold text-paper transition-transform hover:scale-[1.03]"
      >
        {dict.notFound.cta}
      </Link>
    </main>
  );
}
