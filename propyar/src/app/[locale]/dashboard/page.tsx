import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import {
  getAccountViews,
  getActiveChallenges,
  getReviewOrders,
} from '@/lib/data';
import { getAlerts, getDailyPnl, getSuccessRate } from '@/lib/dashboard';
import { prisma } from '@/lib/prisma';
import { path } from '@/lib/routes';
import {
  AlertsList,
  ChallengeCard,
  DashStat,
  MyAccounts,
  PlansMini,
  PnlChart,
  QuickActions,
} from '@/components/dashboard/Overview';
import { CardIcon, LayersIcon, TrophyIcon, BarsIcon } from '@/components/site/Icons';

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

  const [accounts, reviewOrders, plans, alerts, successRate, pendingSum] =
    await Promise.all([
      getAccountViews(session.sub),
      getReviewOrders(session.sub),
      getActiveChallenges(),
      getAlerts(session.sub),
      getSuccessRate(session.sub),
      prisma.payout.aggregate({
        where: { userId: session.sub, status: { in: ['REQUESTED', 'APPROVED'] } },
        _sum: { amount: true },
      }),
    ]);

  const live = accounts.filter((a) => a.status === 'ACTIVE' || a.status === 'FUNDED');
  // The headline card follows the account a trader is most likely working on:
  // a live challenge first, then a funded account, then anything at all.
  const main =
    live.find((a) => a.phase !== 'FUNDED') ?? live[0] ?? accounts[0] ?? null;
  const pnl = main ? await getDailyPnl(main.id, 7) : [];
  const totalProfit = accounts.reduce((s, a) => s + a.metrics.profit, 0);
  const capital = accounts.reduce((s, a) => s + a.startingBalance, 0);
  const s = dict.dash2.stats;
  const usd = (n: number) =>
    `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {reviewOrders.map((r) => (
        <div key={r.id} className="rounded-2xl border border-gold-400/50 bg-gold-400/[0.12] p-4">
          <p className="text-sm font-bold text-white/85">
            {dict.dashboard.reviewTitle} —{' '}
            {(r.plan ?? '').replace(
              /^(ONE_STEP|TWO_STEP|INSTANT)/,
              (m) => dict.plansPage.typeLabels[m as keyof typeof dict.plansPage.typeLabels] ?? m,
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/60">{dict.checkout.review}</p>
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashStat label={s.active} value={String(live.length)} icon={<LayersIcon size={40} />} />
        <DashStat
          label={s.profit}
          value={usd(totalProfit)}
          icon={<BarsIcon size={40} />}
          delta={
            capital > 0 && totalProfit !== 0
              ? { text: `${totalProfit > 0 ? '+' : ''}${((totalProfit / capital) * 100).toFixed(1)}%`, good: totalProfit > 0 }
              : null
          }
        />
        <DashStat label={s.pending} value={usd(pendingSum._sum.amount ?? 0)} icon={<CardIcon size={40} />} />
        <DashStat label={s.success} value={`${successRate}%`} icon={<TrophyIcon size={40} />} />
      </div>

      {main ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <ChallengeCard account={main} locale={loc} dict={dict} />
          <PnlChart points={pnl} locale={loc} t={dict.dash2.chart} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] bg-paper p-10 text-center shadow-card">
          <p className="text-white/60">{dict.dash2.card.noAccount}</p>
          <Link href={path(loc, '/dashboard/buy')} className="btn-primary">
            {dict.dashboard.overview.startCta}
          </Link>
        </div>
      )}

      <QuickActions locale={loc} dict={dict} />

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[1fr_1fr_1.3fr]">
        <AlertsList alerts={alerts} locale={loc} dict={dict} />
        {accounts.length > 0 ? (
          <MyAccounts accounts={accounts} locale={loc} dict={dict} />
        ) : (
          <div className="hidden xl:block" />
        )}
        <PlansMini plans={plans} locale={loc} dict={dict} />
      </div>
    </div>
  );
}
