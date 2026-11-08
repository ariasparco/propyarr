import 'server-only';
import { prisma } from './prisma';
import { audit } from './api';
import { email as mailer } from './email';
import { loadMonitorSettings } from './data';
import { issueCertificate } from './certificate-issue';
import { fetchLiveSnapshot, fetchClosedDeals } from './monitor-source';
import { nextWatermarks } from './watermarks';
import {
  buildReport,
  type AccountReport,
  type MonitorTrade,
  type RuleKey,
} from './monitor';

const RULE_NAMES_FA: Record<RuleKey | string, string> = {
  DAILY_DRAWDOWN: 'دراوداون روزانه',
  MAX_DRAWDOWN: 'دراوداون کلی',
  FLOATING_RISK: 'ریسک شناور',
  INSTRUMENT: 'معامله نماد غیرمجاز',
  HFT_COOLDOWN: 'وقفه پس از معامله زیان‌ده',
};

/** Pulls new closed deals from the broker into the Trade table. */
async function syncTrades(account: {
  id: string;
  metaApiId: string | null;
  createdAt: Date;
}): Promise<void> {
  const deals = await fetchClosedDeals(account.metaApiId, account.createdAt);
  if (deals.length === 0) return;

  for (const d of deals) {
    // externalId is unique, so an already-imported deal is skipped.
    await prisma.trade
      .create({
        data: {
          accountId: account.id,
          externalId: d.externalId,
          symbol: d.symbol,
          type: d.type,
          lot: d.lot,
          openPrice: 0,
          closePrice: 0,
          profit: d.profit,
          openedAt: d.openedAt,
          closedAt: d.closedAt,
        },
      })
      .catch(() => undefined);
  }
}

/**
 * Runs the full rule check for one account: syncs trades, pulls live
 * balance/equity, evaluates every rule, then persists the outcome. A hard breach
 * fails the account and is recorded so support can see which rule was hit.
 */
export async function runAccountCheck(
  accountId: string,
  opts: { userId?: string } = {},
): Promise<AccountReport | null> {
  const found = await prisma.tradingAccount.findFirst({
    where: opts.userId
      ? { id: accountId, userId: opts.userId }
      : { id: accountId },
    select: { id: true, metaApiId: true, createdAt: true },
  });
  if (!found) return null;

  await syncTrades(found);

  const account = await prisma.tradingAccount.findUnique({
    where: { id: found.id },
    include: { challenge: true, trades: true, user: { select: { email: true } } },
  });
  if (!account) return null;

  const settings = await loadMonitorSettings();
  const live = await fetchLiveSnapshot(account);

  // When the terminal agent is feeding the bridge it has already folded its
  // samples in. When the data came from MetaApi there is no agent, so this
  // check is the only chance to record the worst point — every check tightens
  // the marks, and the report below is judged against them.
  const marks =
    live.source === 'bridge'
      ? {
          dayStartBalance: account.dayStartBalance,
          dayLowKey: account.dayLowKey,
          dayLowEquity: account.dayLowEquity,
          lowestEquity: account.lowestEquity,
          worstFloating: account.worstFloating,
        }
      : nextWatermarks(
          {
            dayStartBalance: account.dayStartBalance,
            dayLowKey: account.dayLowKey,
            dayLowEquity: account.dayLowEquity,
            lowestEquity: account.lowestEquity,
            worstFloating: account.worstFloating,
          },
          {
            balance: live.balance,
            equity: live.equity,
            openCount: live.openPositions.length,
          },
          settings.dayResetUtcOffset,
        );

  const closedTrades: MonitorTrade[] = account.trades.map((t) => ({
    symbol: t.symbol,
    profit: t.profit,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  }));
  const openTrades: MonitorTrade[] = live.openPositions.map((p) => ({
    symbol: p.symbol,
    profit: p.profit,
    openedAt: p.openedAt,
    closedAt: null,
  }));

  const report = buildReport(
    {
      startingBalance: account.startingBalance,
      balance: live.balance,
      equity: live.equity,
      dayLowEquity: marks.dayLowEquity,
      lowestEquity: marks.lowestEquity,
      worstFloating: marks.worstFloating,
      dayStartBalance: marks.dayStartBalance,
      phase: account.phase,
      status: account.status,
    },
    account.challenge,
    [...closedTrades, ...openTrades],
    settings,
    live.source,
  );

  // Counted the same way the rule engine counts it: one day per day a trade was
  // opened. Deriving it from the report keeps the stored figure and the figure
  // the trader sees from ever disagreeing.
  const tradingDays =
    report.rules.find((r) => r.key === 'MIN_TRADING_DAYS')?.used ?? 0;

  const alreadyClosed =
    account.status === 'FAILED' || account.status === 'DISABLED';
  const failing = report.breaches.length > 0 && !alreadyClosed;
  const newlyPassed = report.status === 'PASSED' && account.status === 'ACTIVE';

  await prisma.tradingAccount.update({
    where: { id: account.id },
    data: {
      balance: live.balance,
      equity: live.equity,
      dayStartBalance: marks.dayStartBalance,
      dayLowKey: marks.dayLowKey,
      dayLowEquity: marks.dayLowEquity,
      lowestEquity: marks.lowestEquity,
      worstFloating: marks.worstFloating,
      tradingDays,
      lastCheckedAt: new Date(),
      ...(failing
        ? {
            status: 'FAILED',
            breachRule: report.breaches[0],
            breachedAt: new Date(),
            breachSource: 'AUTO',
          }
        : newlyPassed
          ? { status: 'PASSED' }
          : {}),
    },
  });

  if (failing) {
    await audit('account.breach', account.userId, {
      accountId: account.id,
      accountNumber: account.accountNumber,
      rules: report.breaches,
      equity: live.equity,
    });
    await mailer.breach(
      account.user.email,
      account.accountNumber,
      RULE_NAMES_FA[report.breaches[0]] ?? report.breaches[0],
    );
  } else if (newlyPassed) {
    await audit('account.passed', account.userId, {
      accountId: account.id,
      phase: account.phase,
    });
    // Certificate first, so the email that follows is not a promise of
    // something that is not there yet.
    await issueCertificate(
      account.id,
      account.phase === 'PHASE_2' ? 'PHASE_2' : 'PHASE_1',
      { notify: false },
    );
    await mailer.stagePassed(
      account.user.email,
      account.accountNumber,
      account.phase === 'PHASE_1' ? 'حساب مرحله دوم' : 'حساب نهایی (فاند)',
    );
  }

  return report;
}

/**
 * Sweeps every live account. Used by the scheduler and the cron endpoint so a
 * breach is caught even when nobody opens the dashboard.
 */
export async function runMonitorSweep(): Promise<{
  checked: number;
  failed: number;
}> {
  const accounts = await prisma.tradingAccount.findMany({
    where: { status: { in: ['ACTIVE', 'FUNDED'] } },
    select: { id: true },
  });

  let failed = 0;
  for (const { id } of accounts) {
    try {
      const report = await runAccountCheck(id);
      if (report?.breaches.length) failed += 1;
    } catch (err) {
      console.error('monitor sweep: account check failed', id, err);
    }
  }
  return { checked: accounts.length, failed };
}
