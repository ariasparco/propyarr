import { redirect } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { path } from '@/lib/routes';
import { AppShell, type NavItem } from '@/components/dashboard/AppShell';

// Authenticated admin area — never statically cache.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
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
  if (session.role !== 'ADMIN') redirect(path(loc, '/dashboard'));

  const nav = dict.admin.nav;
  const items: NavItem[] = [
    { href: path(loc, '/admin'), label: nav.overview, icon: 'overview' },
    { href: path(loc, '/admin/users'), label: nav.users, icon: 'users' },
    { href: path(loc, '/admin/orders'), label: nav.orders, icon: 'orders' },
    {
      href: path(loc, '/admin/accounts'),
      label: nav.accounts,
      icon: 'accounts',
    },
    { href: path(loc, '/admin/payouts'), label: nav.payouts, icon: 'payouts' },
    { href: path(loc, '/admin/kyc'), label: nav.kyc, icon: 'profile' },
    {
      href: path(loc, '/admin/discounts'),
      label: nav.discounts,
      icon: 'discounts',
    },
    { href: path(loc, '/admin/tickets'), label: nav.tickets, icon: 'tickets' },
    { href: path(loc, '/admin/reviews'), label: nav.reviews, icon: 'tickets' },
    { href: path(loc, '/admin/rules'), label: nav.rules, icon: 'rules' },
  ];

  return (
    <AppShell
      locale={loc}
      title={dict.admin.title}
      brandName={dict.brand}
      items={items}
      user={{ name: session.name, role: session.role }}
      logoutLabel={dict.nav.logout}
      siteLabel={dict.nav.home}
      crossLink={{
        href: path(loc, '/dashboard'),
        label: dict.nav.dashboard,
      }}
    >
      {children}
    </AppShell>
  );
}
