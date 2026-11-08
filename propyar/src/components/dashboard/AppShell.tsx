'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/site/Logo';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { LogoutButton } from './LogoutButton';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  /** Small pill after the label, e.g. "new". */
  badge?: string;
};

type Props = {
  locale: Locale;
  title: string;
  brandName?: string;
  items: NavItem[];
  user: { name: string; role: string };
  logoutLabel: string;
  siteLabel: string;
  crossLink?: { href: string; label: string };
  /** "Hi {name}" line and its subtitle; falls back to the page title. */
  greeting?: { hello: string; sub: string };
  /** Shown above every page, e.g. the identity-verification reminder. */
  notice?: ReactNode;
  /** Header shortcuts: help, messages, notifications. */
  shortcuts?: { help: string; messages: string; alerts: string; hasAlerts?: boolean };
  children: ReactNode;
};

/**
 * Light panel shell: a white sidebar on the reading-start side, a top bar with
 * the greeting and shortcuts, and the page beneath. Shared by the trader
 * dashboard and the admin panel.
 */
export function AppShell({
  locale,
  title,
  brandName,
  items,
  user,
  logoutLabel,
  siteLabel,
  crossLink,
  greeting,
  notice,
  shortcuts,
  children,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== items[0]?.href && pathname.startsWith(href));

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center px-6">
        <Link href={path(locale, '/')}>
          <Logo name={brandName} />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={
                'flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold transition-all ' +
                (active
                  ? 'bg-gradient-to-l from-[#0B5A37] to-[#14945A] text-paper shadow-glow'
                  : 'text-white/70 hover:bg-brand-500/[0.07] hover:text-brand-300')
              }
            >
              <Icon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-bold ' +
                    (active ? 'bg-paper/25 text-paper' : 'bg-brand-500 text-paper')
                  }
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 p-4">
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
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen border-e border-white/[0.06] bg-paper lg:block">
        {Sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#03261B]/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 bg-paper shadow-card-hover">{Sidebar}</div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-20 items-center justify-between gap-3 border-b border-white/[0.06] bg-paper/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 lg:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              </svg>
            </button>
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400 sm:flex">
              <Icon name="profile" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold text-white sm:text-lg">
                {greeting ? `${greeting.hello} 👋` : title}
              </h1>
              {greeting && <p className="truncate text-xs text-white/50 sm:text-sm">{greeting.sub}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {shortcuts && (
              <div className="hidden items-center gap-1 sm:flex">
                <HeaderIcon href={path(locale, '/faq')} label={shortcuts.help}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
                </HeaderIcon>
                <HeaderIcon href={path(locale, '/dashboard/tickets')} label={shortcuts.messages}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </HeaderIcon>
                <HeaderIcon href={path(locale, '/dashboard#alerts')} label={shortcuts.alerts} dot={shortcuts.hasAlerts}>
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
                </HeaderIcon>
              </div>
            )}
            <LanguageSwitcher locale={locale} />
            {!greeting && (
              <span className="hidden text-sm font-semibold text-white/70 sm:inline">{user.name}</span>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {notice}
          {children}
        </main>
      </div>
    </div>
  );
}

function HeaderIcon({
  href,
  label,
  dot,
  children,
}: {
  href: string;
  label: string;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-brand-500/10 hover:text-brand-300"
    >
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {dot && <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-paper" />}
    </Link>
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
  | 'rules'
  | 'analysis'
  | 'kyc'
  | 'support'
  | 'settings'
  | 'trophy';

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
    analysis: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    kyc: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <circle cx="8.5" cy="11" r="2.5" />
        <path d="M5 16.5c.6-1.6 2-2.5 3.5-2.5s2.9.9 3.5 2.5M14 9h5M14 13h4" />
      </>
    ),
    support: (
      <>
        <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
        <path d="M21 15a2 2 0 0 1-2 2h-1v-5h3zM3 15a2 2 0 0 0 2 2h1v-5H3z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4" />
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
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {paths[name]}
    </svg>
  );
}
