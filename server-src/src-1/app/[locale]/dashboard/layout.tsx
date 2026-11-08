import { redirect } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { path } from '@/lib/routes';
import { AppShell, type NavItem } from '@/components/dashboard/AppShell';

// Authenticated, per-user area — never statically cache.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) redirect(path(loc, '/login'));

  const nav = dict.dashboard.nav;
  const items: NavItem[] = [
    { href: path(loc, '/dashboard'), label: nav.overview, icon: 'overview' },
    {
      href: path(loc, '/dashboard/accounts'),
      label: nav.accounts,
      icon: 'accounts',
    },
    { href: path(loc, '/dashboard/buy'), label: nav.buy, icon: 'buy' },
    {
      href: path(loc, '/dashboard/orders'),
      label: nav.orders,
      icon: 'orders',
    },
    { href: path(loc, '/dashboard/wallet'), label: nav.wallet, icon: 'wallet' },
    {
      href: path(loc, '/dashboard/payouts'),
      label: nav.payouts,
      icon: 'payouts',
    },
    {
      href: path(loc, '/dashboard/certificates'),
      label: nav.certificates,
      icon: 'certificate',
    },
    {
      href: path(loc, '/dashboard/referrals'),
      label: nav.referrals,
      icon: 'referrals',
    },
    {
      href: path(loc, '/dashboard/tickets'),
      label: nav.tickets,
      icon: 'tickets',
    },
    {
      href: path(loc, '/dashboard/profile'),
      label: nav.profile,
      icon: 'profile',
    },
  ];

  return (
    <AppShell
      locale={loc}
      title={dict.meta.dashboard.title}
      brandName={dict.brand}
      items={items}
      user={{ name: session.name, role: session.role }}
      logoutLabel={dict.nav.logout}
      siteLabel={dict.nav.home}
      crossLink={
        session.role === 'ADMIN'
          ? { href: path(loc, '/admin'), label: dict.admin.title }
          : undefined
      }
    >
      {children}
    </AppShell>
  );
}
