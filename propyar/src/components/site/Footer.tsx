import Link from 'next/link';
import { Logo } from './Logo';
import { path } from '@/lib/routes';
import { SITE } from '@/lib/constants';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

export function Footer({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const f = dict.footer;
  const cols = [
    {
      title: f.product,
      links: [
        { href: path(locale, '/plans'), label: f.links.plans },
        { href: path(locale, '/rules'), label: f.links.rules },
        { href: path(locale, '/faq'), label: f.links.faq },
      ],
    },
    {
      title: f.company,
      links: [
        { href: path(locale, '/about'), label: f.links.about },
        { href: path(locale, '/contact'), label: f.links.contact },
      ],
    },
    {
      title: f.legal,
      links: [
        { href: path(locale, '/rules'), label: f.links.terms },
        { href: path(locale, '/rules'), label: f.links.privacy },
        { href: path(locale, '/rules'), label: f.links.risk },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/[0.06] bg-ink-950/60">
      <div className="container-x py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo name={dict.brand} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              {f.tagline}
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href={`https://t.me/${SITE.telegram}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:border-brand-500/40 hover:text-brand-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.9.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6 13.3l-4.9-1.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5Z" />
                </svg>
              </a>
              <a
                href={`https://twitter.com/${SITE.twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:border-brand-500/40 hover:text-brand-300"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 3.8H5.5L17.7 20Z" />
                </svg>
              </a>
              <a
                href={`mailto:${SITE.email}`}
                aria-label="Email"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:border-brand-500/40 hover:text-brand-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </a>
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-white/50 transition-colors hover:text-white/90"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-white/40 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {SITE.name}. {f.rights}
          </p>
          <p>
            {SITE.name} — {f.tagline}
          </p>
        </div>
      </div>
    </footer>
  );
}
