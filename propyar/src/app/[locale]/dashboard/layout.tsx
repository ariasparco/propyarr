import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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

  const me = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { kycStatus: true },
  });
  const kyc = me?.kycStatus ?? 'NONE';

  const d = dict.dash2;
  const n = d.nav;
  const items: NavItem[] = [
    { href: path(loc, '/dashboard'), label: n.overview, icon: 'overview' },
    { href: path(loc, '/dashboard/accounts'), label: n.challenges, icon: 'trophy' },
    { href: path(loc, '/dashboard/buy'), label: n.buy, icon: 'buy' },
    { href: path(loc, '/dashboard/orders'), label: n.orders, icon: 'orders' },
    { href: path(loc, '/dashboard/wallet'), label: n.wallet, icon: 'wallet' },
    { href: path(loc, '/dashboard/payouts'), label: n.payouts, icon: 'payouts' },
    { href: path(loc, '/dashboard/discounts'), label: n.discounts, icon: 'discounts' },
    { href: path(loc, '/dashboard/referrals'), label: n.referrals, icon: 'referrals' },
    {
      href: path(loc, '/dashboard/analysis'),
      label: n.analysis,
      icon: 'analysis',
      badge: d.newBadge,
    },
    { href: path(loc, '/dashboard/certificates'), label: n.certificates, icon: 'certificate' },
    { href: path(loc, '/dashboard/kyc'), label: n.kyc, icon: 'kyc' },
    { href: path(loc, '/dashboard/tickets'), label: n.support, icon: 'support' },
    { href: path(loc, '/dashboard/profile'), label: n.settings, icon: 'settings' },
  ];

  // Until identity is approved nothing can be bought, so say so on every page.
  const notice =
    kyc !== 'APPROVED' ? (
      <div
        className={
          'mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ' +
          (kyc === 'REJECTED'
            ? 'border-red-500/30 bg-red-500/[0.06]'
            : 'border-gold-400/50 bg-gold-400/[0.12]')
        }
      >
        <p className="text-sm font-semibold text-white/85">
          {d.kycNotice[kyc as 'NONE' | 'PENDING' | 'REJECTED'] ?? d.kycNotice.NONE}
        </p>
        {kyc !== 'PENDING' && (
          <Link href={path(loc, '/dashboard/kyc')} className="btn-primary py-2 text-xs">
            {d.kycNotice.cta}
          </Link>
        )}
      </div>
    ) : null;

  return (
    <AppShell
      locale={loc}
      title={dict.meta.dashboard.title}
      brandName={dict.brand}
      items={items}
      user={{ name: session.name, role: session.role }}
      logoutLabel={dict.nav.logout}
      siteLabel={dict.nav.home}
      greeting={{ hello: d.hello.replace('{name}', session.name), sub: d.sub }}
      shortcuts={{ help: d.help, messages: d.messages, alerts: d.alertsLabel, hasAlerts: kyc !== 'APPROVED' }}
      notice={notice}
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
