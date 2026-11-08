'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/site/Logo';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { LogoutButton } from './LogoutButton';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';

export type NavItem = { href: string; label: string; icon: IconKey };

type Props = {
  locale: Locale;
  title: string;
  brandName?: string;
  items: NavItem[];
  user: { name: string; role: string };
  logoutLabel: string;
  siteLabel: string;
  crossLink?: { href: string; label: string };
  children: ReactNode;
};

export function AppShell({
  locale,
  title,
  brandName,
  items,
  user,
  logoutLabel,
  siteLabel,
  crossLink,
  children,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== items[0]?.href && pathname.startsWith(href));

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href={path(locale, '/')}>
          <Logo name={brandName} />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ' +
              (isActive(item.href)
                ? 'bg-brand-500/10 text-brand-200 ring-1 ring-brand-500/20'
                : 'text-white/60 hover:bg-white/[0.04] hover:text-white')
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-2 border-t border-white/[0.06] p-3">
        {crossLink && (
          <Link href={crossLink.href} className="btn-ghost w-full">
            {crossLink.label}
          </Link>
        )}
        <Link href={path(locale, '/')} className="btn-ghost w-full">
          {siteLabel}
        </Link>
        <LogoutButton locale={locale} label={logoutLabel} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen border-e border-white/[0.06] bg-ink-850/50 lg:block">
        {Sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 w-72 border-e border-white/[0.06] bg-ink-850">
            {Sidebar}
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-900/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 lg:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher locale={locale} />
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-sm font-semibold text-brand-300">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-white/70">{user.name}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

type IconKey =
  | 'overview'
  | 'accounts'
  | 'buy'
  | 'payouts'
  | 'profile'
  | 'users'
  | 'orders'
  | 'wallet'
  | 'certificate'
  | 'referrals'
  | 'tickets'
  | 'discounts'
  | 'rules';

function Icon({ name }: { name: IconKey }) {
  const paths: Record<IconKey, ReactNode> = {
    overview: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
    accounts: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    buy: (
      <>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
      </>
    ),
    payouts: (
      <>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 21c0-3.5 3-5.5 7-5.5M16 15.5c2.5.5 4 2.4 4 5.5M17 4.5a3.5 3.5 0 0 1 0 7" />
      </>
    ),
    orders: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    rules: (
      <>
        <path d="M9 11l3 3 8-8" />
        <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M16 12h5v-3h-5a1.5 1.5 0 0 0 0 3z" />
      </>
    ),
    certificate: (
      <>
        <circle cx="12" cy="9" r="5" />
        <path d="M8.5 13.5L7 22l5-2.5L17 22l-1.5-8.5" />
      </>
    ),
    referrals: (
      <>
        <circle cx="8" cy="8" r="3" />
        <path d="M2 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
        <path d="M17 11h5M19.5 8.5v5" />
      </>
    ),
    tickets: (
      <>
        <path d="M21 11.5a3 3 0 0 0 0-5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1.5a3 3 0 0 1 0 5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
        <path d="M13 6v2M13 11v2M13 16v2" />
      </>
    ),
    discounts: (
      <>
        <path d="M20.6 11.4L12.5 3.3A2 2 0 0 0 11 2.7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 .6 1.4l8.1 8.1a2 2 0 0 0 2.9 0l6-6a2 2 0 0 0 0-2.8z" />
        <circle cx="7.5" cy="7.5" r="1.2" />
      </>
    ),
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {paths[name]}
    </svg>
  );
}
