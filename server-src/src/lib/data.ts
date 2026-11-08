import 'server-only';
import { prisma } from './prisma';
import { DEFAULT_RULES } from './constants';
import {
  buildReport,
  MONITOR_DEFAULTS,
  voidedProfit,
  type MonitorSettings,
  type MonitorTrade,
} from './monitor';
import { evaluatePayout } from './payout-rules';
import type {
  PlanView,
  AccountView,
  PayoutView,
  DashboardSummary,
} from './types';

export async function getActiveChallenges(): Promise<PlanView[]> {
  let rows;
  try {
    rows = await prisma.challenge.findMany({
      where: { active: true },
      orderBy: { virtualCapital: 'asc' },
    });
  } catch (err) {
    // DB not migrated/seeded yet — fail soft so the site still renders.
    console.warn('getActiveChallenges: database not ready', err);
    return [];
  }
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    accountType: c.accountType,
    price: c.price,
    virtualCapital: c.virtualCapital,
    profitTarget: c.profitTarget,
    profitTargetP2: c.profitTargetP2,
    dailyDrawdown: c.dailyDrawdown,
    maxDrawdown: c.maxDrawdown,
    floatingRisk: c.floatingRisk,
    minTradingDays: c.minTradingDays,
    leverage: c.leverage,
    profitSplit: c.profitSplit,
    popular: c.popular,
    comingSoon: c.comingSoon,
  }));
}

/**
 * Open positions as the bridge last stored them, shaped for the rule engine.
 *
 * Open trades belong in the same list as closed ones: the instrument rule, the
 * trading-day count and the floating figure all need them. Dropping them left
 * the dashboard blind to whatever was running right now.
 */
function parseOpenPositions(raw: string | null): MonitorTrade[] {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as Array<{
      symbol?: string;
      profit?: number;
      openedAt?: string;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((p) => ({
      symbol: String(p.symbol ?? ''),
      profit: Number(p.profit ?? 0),
      openedAt: p.openedAt ? new Date(p.openedAt) : new Date(),
      closedAt: null,
    }));
  } catch {
    return [];
  }
}

export async function loadMonitorSettings(): Promise<MonitorSettings> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'rules' } });
    if (setting) {
      const parsed = JSON.parse(setting.value) as Partial<MonitorSettings>;
      return { ...MONITOR_DEFAULTS, ...parsed };
    }
  } catch {
    /* fall through to defaults */
  }
  return {
    ...MONITOR_DEFAULTS,
    consistencyRulePercent: DEFAULT_RULES.consistencyRulePercent,
  };
}

export async function getAccountViews(userId: string): Promise<AccountView[]> {
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId },
    include: {
      challenge: true,
      trades: true,
      certificates: { select: { id: true, stage: true, note: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const settings = await loadMonitorSettings();

  // The latest stage request per account, with whatever staff wrote on it.
  //
  // Only the fact that a request existed used to be carried through, which was
  // enough to grey out the button and nothing else. The trader could not see
  // whether it had been looked at, what was decided, or why — the decision is
  // made by a person reading the account, so their answer is the part that
  // matters most.
  const stageRequests = await prisma.order.findMany({
    where: {
      userId,
      kind: { not: 'PURCHASE' },
      sourceAccountId: { in: accounts.map((a) => a.id) },
    },
    select: {
      sourceAccountId: true,
      fulfillment: true,
      reviewStatus: true,
      reviewNote: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const requestByAccount = new Map<string, (typeof stageRequests)[number]>();
  for (const r of stageRequests) {
    if (r.sourceAccountId && !requestByAccount.has(r.sourceAccountId))
      requestByAccount.set(r.sourceAccountId, r);
  }

  return accounts.map((a) => {
    // The same watermarks the on-demand check is judged against. Leaving them
    // out made this card compute the drawdowns from the current equity alone,
    // so the dashboard and the rule panel showed two different numbers for one
    // account — and the card was always the more flattering of the two.
    const openPositions = parseOpenPositions(a.openPositions);
    const report = buildReport(
      {
        startingBalance: a.startingBalance,
        balance: a.balance,
        equity: a.equity,
        dayLowEquity: a.dayLowEquity,
        lowestEquity: a.lowestEquity,
        dayLowBalance: a.dayLowBalance,
        lowestBalance: a.lowestBalance,
        worstFloating: a.worstFloating,
        worstFloatingPct: a.worstFloatingPct,
        dayStartBalance: a.dayStartBalance,
        openedAt: a.createdAt,
        openPositions: openPositions.length,
        phase: a.phase,
        status: a.status,
      },
      a.challenge,
      [
        ...a.trades.map((t) => ({
          symbol: t.symbol,
          profit: t.profit,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
        })),
        ...openPositions,
      ],
      // Same broker clock the rule engine judged this account against, so the
      // dashboard card and the panel cannot disagree about where the day began.
      a.brokerUtcOffset === null || a.brokerUtcOffset === undefined
        ? settings
        : { ...settings, dayResetUtcOffset: a.brokerUtcOffset },
      'stored',
    );
    const rule = (key: string) => report.rules.find((r) => r.key === key);
    const closed = a.trades.filter((t) => t.closedAt);
    const winRate = closed.length
      ? (closed.filter((t) => t.profit > 0).length / closed.length) * 100
      : 0;

    return {
      id: a.id,
      accountNumber: a.accountNumber,
      platform: a.platform,
      server: a.server,
      password: a.password ?? '',
      investorPassword: a.investorPassword ?? '',
      startingBalance: a.startingBalance,
      balance: a.balance,
      equity: a.equity,
      status: a.status,
      phase: a.phase,
      tradingDays: a.tradingDays,
      challengeName: a.challenge.name,
      accountType: a.challenge.accountType,
      profitTarget: report.targetPct,
      dailyDrawdown: a.challenge.dailyDrawdown,
      maxDrawdown: a.challenge.maxDrawdown,
      breachRule: a.breachRule,
      breachSource: a.breachSource,
      breachNote: a.breachNote,
      advanceRequest: (() => {
        const r = requestByAccount.get(a.id);
        if (!r) return null;
        // A completed request is history — the next account has been issued and
        // this card is the old stage. Nothing left to report on it.
        if (r.fulfillment === 'COMPLETED') return null;
        return {
          state: (r.reviewStatus ?? 'PENDING') as
            | 'PENDING'
            | 'APPROVED'
            | 'REJECTED',
          note: r.reviewNote,
          at: r.createdAt.toISOString(),
        };
      })(),
      lastSyncedAt: a.snapshotAt?.toISOString() ?? null,
      certificates: a.certificates.map((c) => ({
        id: c.id,
        stage: c.stage,
        note: c.note ?? '',
      })),
      metrics: {
        profit: report.profit,
        profitPct: report.profitPct,
        progressPct: rule('PROFIT_TARGET')?.usedPct ?? 0,
        targetBalance: report.targetBalance,
        targetRemaining: report.targetRemaining,
        // Taken from the overall-drawdown rule rather than recomputed from the
        // live equity, so the card cannot disagree with the panel beside it.
        drawdownPct:
          a.startingBalance > 0
            ? ((rule('MAX_DRAWDOWN')?.used ?? 0) / a.startingBalance) * 100
            : 0,
        winRate,
        floatingPl: report.floatingPnl,
        targetReached: rule('PROFIT_TARGET')?.state === 'MET',
        minDaysMet: rule('MIN_TRADING_DAYS')?.state === 'MET',
      },
    };
  });
}

export async function getReviewOrders(userId: string) {
  const orders = await prisma.order.findMany({
    // Top-ups never need fulfilment, so they must never appear in the
    // "your account is being prepared" banner.
    where: { userId, fulfillment: 'REVIEW', kind: { not: 'TOPUP' } },
    include: {
      challenge: { select: { name: true, accountType: true, virtualCapital: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => ({
    id: o.id,
    plan: o.challenge ? `${o.challenge.accountType} ${o.challenge.name}` : null,
    virtualCapital: o.challenge?.virtualCapital ?? null,
    amount: o.amount,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** Every order the trader has placed, newest first, for the orders page. */
export async function getUserOrders(userId: string) {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      challenge: {
        select: { name: true, accountType: true, virtualCapital: true },
      },
      tradingAccount: { select: { accountNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return orders.map((o) => ({
    id: o.id,
    // Null on a wallet top-up: it buys credit, not a plan.
    plan: o.challenge ? `${o.challenge.accountType} ${o.challenge.name}` : null,
    virtualCapital: o.challenge?.virtualCapital ?? null,
    amount: o.amount,
    method: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    fulfillment: o.fulfillment,
    kind: o.kind,
    accountNumber: o.tradingAccount?.accountNumber ?? null,
    txHash: o.txHash,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function getUserPayouts(userId: string): Promise<PayoutView[]> {
  const payouts = await prisma.payout.findMany({
    where: { userId },
    include: { account: { select: { accountNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return payouts.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    method: p.method,
    wallet: p.wallet,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    accountNumber: p.account.accountNumber,
  }));
}

export async function getDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  const accounts = await getAccountViews(userId);
  const active = accounts.filter(
    (a) => a.status === 'ACTIVE' || a.status === 'FUNDED',
  ).length;
  const totalProfit = accounts.reduce((sum, a) => sum + a.metrics.profit, 0);
  const winRates = accounts.filter((a) => a.metrics.winRate > 0);
  const winRate =
    winRates.length > 0
      ? winRates.reduce((s, a) => s + a.metrics.winRate, 0) / winRates.length
      : 0;
  const pendingPayouts = await prisma.payout.count({
    where: { userId, status: { in: ['REQUESTED', 'APPROVED'] } },
  });
  return { activeAccounts: active, totalProfit, pendingPayouts, winRate };
}

export async function getFundedAccounts(userId: string) {
  const accounts = await getAccountViews(userId);
  return accounts.filter((a) => a.status === 'FUNDED');
}

/** Funded accounts with their payout eligibility resolved. */
export async function getPayoutAccounts(userId: string) {
  const [accounts, user] = await Promise.all([
    prisma.tradingAccount.findMany({
      where: { userId, status: 'FUNDED' },
      include: { challenge: { select: { profitSplit: true } }, trades: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true },
    }),
  ]);
  if (accounts.length === 0) return [];

  const pending = await prisma.payout.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      status: { in: ['REQUESTED', 'APPROVED'] },
    },
    _count: { _all: true },
  });
  const pendingIds = new Set(pending.map((p) => p.accountId));

  const settings = await loadMonitorSettings();

  return accounts.map((a) => {
    const eligibility = evaluatePayout({
      status: a.status,
      balance: a.balance,
      equity: a.equity,
      startingBalance: a.startingBalance,
      profitSplit: a.challenge.profitSplit,
      fundedAt: a.fundedAt,
      kycStatus: user?.kycStatus ?? 'NONE',
      hasPendingRequest: pendingIds.has(a.id),
      voidedProfit: voidedProfit(
        a.trades.map((t) => ({
          symbol: t.symbol,
          profit: t.profit,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
        })),
        settings.minHoldSeconds,
      ),
      openPositions: parseOpenPositions(a.openPositions).length,
    });
    return {
      id: a.id,
      accountNumber: a.accountNumber,
      profitSplit: a.challenge.profitSplit,
      ...eligibility,
    };
  });
}
