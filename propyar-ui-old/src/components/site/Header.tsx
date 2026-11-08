'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ChevronDownIcon, RocketIcon, UserIcon } from './Icons';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

type Props = {
  locale: Locale;
  nav: Dictionary['nav'];
  planTypes: Dictionary['plansPage']['typeLabels'];
  brandName: string;
  isAuthed: boolean;
};

export function Header({ locale, nav, planTypes, brandName, isAuthed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: path(locale, '/'), label: nav.home },
    { href: path(locale, '/plans'), label: nav.challenges, menu: true },
    { href: path(locale, '/rules'), label: nav.rules },
    { href: path(locale, '/faq'), label: nav.faq },
    { href: path(locale, '/blog'), label: nav.blog },
  ];
  const challengeLinks = (
    Object.entries(planTypes) as Array<[keyof typeof planTypes, string]>
  ).map(([type, label]) => ({
    href: `${path(locale, '/plans')}?type=${type}`,
    label,
  }));

  const isActive = (href: string) =>
    href === path(locale, '/')
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <header
      className={
        'sticky top-0 z-50 transition-all duration-300 ' +
        (scrolled
          ? 'border-b border-brand-400/15 bg-ink-900/95 backdrop-blur-xl'
          : 'border-b border-white/[0.06] bg-ink-900/40')
      }
    >
      <nav className="container-x flex h-[72px] items-center justify-between gap-4">
        <Link href={path(locale, '/')} aria-label={nav.home}>
          <Logo name={brandName} />
        </Link>

        <ul className="hidden items-center gap-2 lg:flex">
          {links.map((l) => (
            <li key={l.href} className="group relative">
              <Link
                href={l.href}
                className={
                  'relative flex items-center gap-1 px-3.5 py-5 text-[15px] font-medium transition-colors ' +
                  (isActive(l.href)
                    ? 'text-brand-300'
                    : 'text-white/80 hover:text-white')
                }
              >
                {l.label}
                {l.menu && <ChevronDownIcon size={15} />}
                {isActive(l.href) && (
                  <span className="absolute inset-x-2 bottom-2.5 h-0.5 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(46,235,158,0.9)]" />
                )}
              </Link>
              {l.menu && (
                <div className="invisible absolute start-0 top-full z-50 min-w-[11rem] translate-y-1 rounded-xl border border-brand-400/20 bg-ink-850/95 p-1.5 opacity-0 shadow-card backdrop-blur-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {challengeLinks.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      className="block rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-brand-400/10 hover:text-brand-200"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {isAuthed ? (
            <Link
              href={path(locale, '/dashboard')}
              className="btn-primary rounded-xl"
            >
              {nav.dashboard}
            </Link>
          ) : (
            <>
              <Link
                href={path(locale, '/login')}
                className="btn rounded-xl border border-white/25 px-4 text-white/90 hover:border-brand-300/60 hover:text-white"
              >
                <UserIcon size={17} />
                {nav.login}
              </Link>
              <Link
                href={path(locale, '/register')}
                className="btn-primary rounded-xl px-6"
              >
                <RocketIcon size={17} />
                {nav.register}
              </Link>
            </>
          )}
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher locale={locale} />
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white"
          >
            <span className="sr-only">Menu</span>
            <div className="space-y-1.5">
              <span
                className={
                  'block h-0.5 w-5 bg-white transition-transform ' +
                  (open ? 'translate-y-2 rotate-45' : '')
                }
              />
              <span
                className={
                  'block h-0.5 w-5 bg-white transition-opacity ' +
                  (open ? 'opacity-0' : '')
                }
              />
              <span
                className={
                  'block h-0.5 w-5 bg-white transition-transform ' +
                  (open ? '-translate-y-2 -rotate-45' : '')
                }
              />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-white/[0.06] bg-ink-900/95 backdrop-blur-xl lg:hidden">
          <ul className="container-x flex flex-col gap-1 py-4">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={
                    'block rounded-xl px-4 py-3 text-base font-medium ' +
                    (isActive(l.href)
                      ? 'bg-white/[0.05] text-white'
                      : 'text-white/70')
                  }
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex flex-col gap-2">
              {isAuthed ? (
                <Link
                  href={path(locale, '/dashboard')}
                  className="btn-primary w-full"
                >
                  {nav.dashboard}
                </Link>
              ) : (
                <>
                  <Link
                    href={path(locale, '/login')}
                    className="btn-ghost w-full"
                  >
                    {nav.login}
                  </Link>
                  <Link
                    href={path(locale, '/register')}
                    className="btn-primary w-full"
                  >
                    {nav.register}
                  </Link>
                </>
              )}
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
