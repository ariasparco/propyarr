import 'server-only';
import { prisma } from './prisma';
import { audit } from './api';
import { email as mailer } from './email';
import { loadMonitorSettings } from './data';
import { issueCertificate } from './certificate-issue';
import { fetchLiveSnapshot, fetchClosedDeals } from './monitor-source';
import { nextWatermarks } from './watermarks';
import { nextPhase } from './plan-rules';
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

/**
 * Terminal data older than this no longer supports a "passed" verdict.
 * Matches the freshness window the data source and the sync badge use.
 */
const STALE_AFTER_MS = 30 * 60_000;

/**
 * The figures behind a breach, stored alongside the verdict.
 *
 * Recorded for every hard rule that fired, not just the first, so support can
 * answer "why was my account failed" with the actual numbers and thresholds
 * rather than a rule name and a shrug.
 */
function breachEvidence(report: AccountReport) {
  return {
    at: report.checkedAt,
    balance: report.balance,
    equity: report.equity,
    source: report.source,
    rules: report.rules
      .filter((r) => report.breaches.includes(r.key))
      .map((r) => ({
        key: r.key,
        used: Math.round(r.used * 100) / 100,
        limit: Math.round(r.limit * 100) / 100,
        pct: Math.round(r.usedPct * 10) / 10,
        detail: r.detail ?? null,
      })),
  };
}

/**
 * How recently an account's deal history was pulled, by account id.
 *
 * Balance and equity have to be read constantly — that is the whole point of
 * frequent checks. Trade history does not: it only changes when a position
 * closes, and pulling it costs a full history query against the broker. With
 * the sweep running every few seconds, re-reading months of history each time
 * would swamp the rate limit and buy nothing.
 *
 * In memory on purpose. Losing it on restart costs one extra history pull.
 */
const lastHistorySync = new Map<string, number>();
const HISTORY_MIN_INTERVAL_MS = 120_000;

/** Pulls new closed deals from the broker into the Trade table. */
async function syncTrades(
  account: {
    id: string;
    metaApiId: string | null;
    createdAt: Date;
  },
  force: boolean,
): Promise<void> {
  const last = lastHistorySync.get(account.id) ?? 0;
  if (!force && Date.now() - last < HISTORY_MIN_INTERVAL_MS) return;
  lastHistorySync.set(account.id, Date.now());

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
  opts: {
    userId?: string;
    /**
     * Pull the deal history regardless of when it was last read. Set when a
     * person pressed the button: they are entitled to the freshest answer the
     * broker can give, whatever the sweep's throttle says.
     */
    forceHistory?: boolean;
  } = {},
): Promise<AccountReport | null> {
  const found = await prisma.tradingAccount.findFirst({
    where: opts.userId
      ? { id: accountId, userId: opts.userId }
      : { id: accountId },
    select: { id: true, metaApiId: true, createdAt: true },
  });
  if (!found) return null;

  await syncTrades(found, opts.forceHistory === true);

  const account = await prisma.tradingAccount.findUnique({
    where: { id: found.id },
    include: { challenge: true, trades: true, user: { select: { email: true } } },
  });
  if (!account) return null;

  const base = await loadMonitorSettings();
  // The broker's own clock decides where this account's trading day starts.
  // The panel's figure is only the fallback, for an account that has not
  // reported yet.
  const settings =
    account.brokerUtcOffset === null || account.brokerUtcOffset === undefined
      ? base
      : { ...base, dayResetUtcOffset: account.brokerUtcOffset };
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
          dayLowBalance: account.dayLowBalance,
          lowestBalance: account.lowestBalance,
          worstFloating: account.worstFloating,
          worstFloatingPct: account.worstFloatingPct,
        }
      : nextWatermarks(
          {
            dayStartBalance: account.dayStartBalance,
            dayLowKey: account.dayLowKey,
            dayLowEquity: account.dayLowEquity,
            lowestEquity: account.lowestEquity,
            dayLowBalance: account.dayLowBalance,
            lowestBalance: account.lowestBalance,
            worstFloating: account.worstFloating,
            worstFloatingPct: account.worstFloatingPct,
          },
          {
            balance: live.balance,
            equity: live.equity,
            openCount: live.openPositions.length,
          },
          settings.dayResetUtcOffset,
        );

  // How old the figures are. A green report over an hour-old snapshot is a
  // statement about the past, and the panel has to be able to say so.
  //
  // MetaApi answers from a terminal that is connected to the broker right now,
  // so what it returns has no age at all. Only pushed snapshots do — those are
  // as old as the last push, which is why `snapshotAt` is the wrong clock for
  // every source.
  const dataAgeMs =
    live.source === 'metaapi'
      ? 0
      : account.snapshotAt
        ? Date.now() - account.snapshotAt.getTime()
        : null;
  const stale = dataAgeMs === null || dataAgeMs > STALE_AFTER_MS;

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
      dayLowBalance: marks.dayLowBalance,
      lowestBalance: marks.lowestBalance,
      worstFloating: marks.worstFloating,
      worstFloatingPct: marks.worstFloatingPct,
      dayStartBalance: marks.dayStartBalance,
      // Conduct rules judge what the trader did on this challenge, not what the
      // login did before it was issued to them.
      openedAt: account.createdAt,
      openPositions: live.openPositions.length,
      phase: account.phase,
      status: account.status,
    },
    account.challenge,
    [...closedTrades, ...openTrades],
    settings,
    live.source,
  );
  report.dataAgeMs = dataAgeMs;
  report.stale = stale;

  // Counted the same way the rule engine counts it: one day per day a trade was
  // opened. Deriving it from the report keeps the stored figure and the figure
  // the trader sees from ever disagreeing.
  const tradingDays =
    report.rules.find((r) => r.key === 'MIN_TRADING_DAYS')?.used ?? 0;

  const alreadyClosed =
    account.status === 'FAILED' || account.status === 'DISABLED';
  // A breach found in old data still happened, so it is still a breach.
  const failing = report.breaches.length > 0 && !alreadyClosed;
  // Passing is the opposite case: it is a claim about the account *right now*,
  // and stale figures cannot support it. A challenge is never completed on the
  // strength of a snapshot nobody has refreshed.
  const newlyPassed =
    report.status === 'PASSED' && account.status === 'ACTIVE' && !stale;

  await prisma.tradingAccount.update({
    where: { id: account.id },
    data: {
      balance: live.balance,
      equity: live.equity,
      // A live MetaApi read is a fresh observation of the account, so it stamps
      // the snapshot clock the same way a bridge push does. Without this the
      // sync badge would keep reporting "never connected" on accounts that are
      // being read every few seconds.
      ...(live.source === 'metaapi'
        ? { snapshotAt: new Date(), snapshotSource: 'metaapi' }
        : {}),
      dayStartBalance: marks.dayStartBalance,
      dayLowKey: marks.dayLowKey,
      dayLowEquity: marks.dayLowEquity,
      lowestEquity: marks.lowestEquity,
      dayLowBalance: marks.dayLowBalance,
      lowestBalance: marks.lowestBalance,
      worstFloating: marks.worstFloating,
      worstFloatingPct: marks.worstFloatingPct,
      tradingDays,
      lastCheckedAt: new Date(),
      ...(failing
        ? {
            status: 'FAILED',
            breachRule: report.breaches[0],
            // The numbers behind the verdict, frozen at the moment it was
            // reached. Without this a disputed account can only be answered
            // with a rule name, and by then the figures have moved on.
            breachDetail: JSON.stringify(breachEvidence(report)),
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
      nextPhase(account.challenge.accountType, account.phase) === 'PHASE_2'
        ? 'حساب مرحله دوم'
        : 'حساب اصلی',
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

  // Checked in parallel, in bounded batches.
  //
  // One at a time was fine when every read went through a single MetaTrader
  // terminal that could only be logged into one account at a time. Once
  // accounts are served by MetaApi that constraint is gone — each one has its
  // own connection — and running them in sequence just makes the last account
  // in the list wait for all the others. With the sweep on a few-second timer,
  // that queue is exactly the blind window this is meant to close.
  //
  // The cap keeps a large roster from opening hundreds of sockets at once, and
  // keeps SQLite from being hit by more concurrent writers than it can take.
  const CONCURRENCY = 8;
  let failed = 0;

  for (let i = 0; i < accounts.length; i += CONCURRENCY) {
    const batch = accounts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ id }) => runAccountCheck(id)),
    );
    results.forEach((r, n) => {
      if (r.status === 'rejected') {
        console.error(
          'monitor sweep: account check failed',
          batch[n].id,
          r.reason,
        );
      } else if (r.value?.breaches.length) {
        failed += 1;
      }
    });
  }

  return { checked: accounts.length, failed };
}
