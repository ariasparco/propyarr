import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getAdminOverview } from '@/lib/admin';
import { formatCurrency } from '@/lib/format';
import { StatCard } from '@/components/dashboard/Widgets';

export default async function AdminOverview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const o = await getAdminOverview();
  const a = dict.admin.overview;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-semibold text-white">{dict.admin.title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label={a.users} value={o.users} />
        <StatCard label={a.orders} value={o.paidOrders} />
        <StatCard
          label={a.revenue}
          value={formatCurrency(o.revenue, loc)}
          tone="good"
        />
        <StatCard label={a.accounts} value={o.activeAccounts} />
        <StatCard
          label={a.pendingPayouts}
          value={o.pendingPayouts}
          tone={o.pendingPayouts > 0 ? 'bad' : 'default'}
        />
      </div>
    </div>
  );
}
