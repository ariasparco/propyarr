import Link from 'next/link';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

export function CtaBand({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const c = dict.ctaBand;
  return (
    <section className="section">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-4xl border border-brand-500/25 bg-gradient-to-br from-teal-800/50 to-ink-850 p-10 text-center sm:p-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-70"
            style={{
              background:
                'radial-gradient(40rem 20rem at 50% -10%, rgba(201,162,39,0.16), transparent 70%), radial-gradient(30rem 20rem at 100% 120%, rgba(15,61,62,0.5), transparent 70%)',
            }}
          />
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold text-white sm:text-4xl">
            {c.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/60">{c.subtitle}</p>
          <Link
            href={path(locale, '/register')}
            className="btn-primary btn-lg mt-8"
          >
            {c.button}
          </Link>
        </div>
      </div>
    </section>
  );
}
