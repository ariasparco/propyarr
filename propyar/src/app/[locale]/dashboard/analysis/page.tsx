import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getAccountViews } from '@/lib/data';
import { getTradeStats, getDailyPnl } from '@/lib/dashboard';
import { prisma } from '@/lib/prisma';
import { path } from '@/lib/routes';
import { DashStat, PnlChart } from '@/components/dashboard/Overview';
import { MyfxbookLink } from '@/components/dashboard/MyfxbookLink';
import { AccountMonitor } from '@/components/dashboard/AccountMonitor';
import { BarsIcon, TargetIcon, TrophyIcon, LayersIcon } from '@/components/site/Icons';

// Per-account trade analysis: statistics, P&L, the live rule monitor and the
// account's Myfxbook link.
export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ account?: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const t = dict.dash2.analysis;
  const session = await getSession();
  if (!session) return null;

  const accounts = await getAccountViews(session.sub);
  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.06] bg-paper p-10 text-center shadow-card">
        <p className="text-white/60">{t.noAccounts}</p>
        <Link href={path(loc, '/dashboard/buy')} className="btn-primary mt-5">
          {dict.dashboard.overview.startCta}
        </Link>
      </div>
    );
  }

  const { account: wanted } = await searchParams;
  const account = accounts.find((a) => a.id === wanted) ?? accounts[0];
  const [stats, pnl, row] = await Promise.all([
    getTradeStats(account.id),
    getDailyPnl(account.id, 14),
    prisma.tradingAccount.findUnique({ where: { id: account.id }, select: { myfxbookUrl: true } }),
  ]);
  const usd = (n: number) =>
    `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-white">{t.title}</h2>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`${path(loc, '/dashboard/analysis')}?account=${a.id}`}
              className={
                'rounded-xl border px-3 py-1.5 font-mono text-sm font-bold transition-colors ' +
                (a.id === account.id
                  ? 'border-brand-500 bg-brand-500 text-paper'
                  : 'border-white/10 bg-paper text-white/70 hover:border-brand-500/50')
              }
            >
              #{a.accountNumber}
            </Link>
          ))}
        </div>
      </div>

      {stats.trades === 0 ? (
        <p className="rounded-2xl border border-white/[0.06] bg-paper p-8 text-center text-white/55 shadow-card">{t.noTrades}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashStat label={t.trades} value={String(stats.trades)} icon={<LayersIcon size={36} />} />
            <DashStat label={t.winRate} value={`${stats.winRate}%`} icon={<TrophyIcon size={36} />} />
            <DashStat label={t.profitFactor} value={stats.profitFactor == null ? '∞' : String(stats.profitFactor)} icon={<BarsIcon size={36} />} />
            <DashStat label={t.avgHold} value={`${stats.avgHoldMinutes} ${t.minutes}`} icon={<TargetIcon size={36} />} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashStat label={t.avgWin} value={usd(stats.avgWin)} icon={<BarsIcon size={30} />} />
            <DashStat label={t.avgLoss} value={usd(stats.avgLoss)} icon={<BarsIcon size={30} />} />
            <DashStat label={t.best} value={usd(stats.best)} icon={<TrophyIcon size={30} />} />
            <DashStat label={t.worst} value={usd(stats.worst)} icon={<TargetIcon size={30} />} />
          </div>
          <PnlChart points={pnl} locale={loc} t={{ title: t.equity, range: dict.dash2.chart.range.replace('۷', '۱۴').replace('7', '14'), empty: t.noTrades }} />
        </>
      )}

      <MyfxbookLink accountId={account.id} initial={row?.myfxbookUrl ?? null} t={t} />

      {account.status !== 'DISABLED' && (
        <div className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
          <h3 className="mb-3 text-lg font-black text-white">{t.rules}</h3>
          <AccountMonitor accountId={account.id} locale={loc} t={dict.monitor} />
        </div>
      )}
    </div>
  );
}
