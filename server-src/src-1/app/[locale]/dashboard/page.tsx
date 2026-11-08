import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import {
  getDashboardSummary,
  getAccountViews,
  getReviewOrders,
} from '@/lib/data';
import { formatCurrency } from '@/lib/format';
import { path } from '@/lib/routes';
import { StatCard } from '@/components/dashboard/Widgets';
import { AccountCard } from '@/components/dashboard/AccountCard';

export default async function DashboardHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const [summary, accounts, reviewOrders] = await Promise.all([
    getDashboardSummary(session.sub),
    getAccountViews(session.sub),
    getReviewOrders(session.sub),
  ]);
  const o = dict.dashboard.overview;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-semibold text-white">
        {dict.dashboard.greeting}، {session.name} 👋
      </h2>

      {reviewOrders.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <p className="text-sm font-semibold text-amber-200">
              {dict.dashboard.reviewTitle} — {r.plan}
            </p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-100/70">
            {dict.checkout.review}
          </p>
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={o.activeAccounts} value={summary.activeAccounts} />
        <StatCard
          label={o.totalProfit}
          value={formatCurrency(summary.totalProfit, loc)}
          tone={summary.totalProfit >= 0 ? 'good' : 'bad'}
        />
        <StatCard label={o.pendingPayouts} value={summary.pendingPayouts} />
        <StatCard label={o.winRate} value={`${summary.winRate.toFixed(0)}%`} />
      </div>

      {accounts.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 p-12 text-center">
          <p className="text-white/50">{o.noAccounts}</p>
          <Link href={path(loc, '/dashboard/buy')} className="btn-primary">
            {o.startCta}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} locale={loc} dict={dict} />
          ))}
        </div>
      )}
    </div>
  );
}
