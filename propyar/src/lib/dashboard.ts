import 'server-only';
import { prisma } from './prisma';
import { getBannerDiscounts } from './data';

const DAY_MS = 86_400_000;

export type PnlPoint = { day: string; pnl: number; cumulative: number };

/** Closed-trade P&L per calendar day (UTC) for one account, last `days` days. */
export async function getDailyPnl(accountId: string, days = 7): Promise<PnlPoint[]> {
  const since = new Date(Date.now() - (days - 1) * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);
  const trades = await prisma.trade.findMany({
    where: { accountId, closedAt: { gte: since } },
    select: { profit: true, closedAt: true },
  });
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const key = (t.closedAt as Date).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + t.profit);
  }
  const out: PnlPoint[] = [];
  let running = 0;
  for (let i = 0; i < days; i++) {
    const key = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const pnl = Math.round((byDay.get(key) ?? 0) * 100) / 100;
    running += pnl;
    out.push({ day: key, pnl, cumulative: Math.round(running * 100) / 100 });
  }
  return out;
}

/** Share of finished challenges that passed, as a percentage (0 when none). */
export async function getSuccessRate(userId: string): Promise<number> {
  const rows = await prisma.tradingAccount.findMany({
    where: { userId },
    select: { status: true, phase: true },
  });
  const passed = rows.filter((r) => r.status === 'PASSED' || r.phase === 'FUNDED').length;
  const failed = rows.filter((r) => r.status === 'FAILED' && r.phase !== 'FUNDED').length;
  return passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;
}

export type DashAlert = {
  kind:
    | 'kycApproved'
    | 'kycPending'
    | 'kycNone'
    | 'kycRejected'
    | 'discount'
    | 'payoutPaid'
    | 'payoutPending'
    | 'passed'
    | 'failed';
  vars: Record<string, string | number>;
  at: string;
};

/**
 * The notifications column: derived from the account's real state rather than
 * stored, so it can never drift from what the rest of the panel shows.
 */
export async function getAlerts(userId: string): Promise<DashAlert[]> {
  const [user, payouts, accounts, discounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, updatedAt: true },
    }),
    prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { amount: true, status: true, createdAt: true, processedAt: true },
    }),
    prisma.tradingAccount.findMany({
      where: { userId, status: { in: ['PASSED', 'FAILED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { accountNumber: true, status: true, updatedAt: true },
    }),
    getBannerDiscounts(),
  ]);

  const alerts: DashAlert[] = [];
  const kyc = user?.kycStatus ?? 'NONE';
  const kycKind = ({
    APPROVED: 'kycApproved',
    PENDING: 'kycPending',
    REJECTED: 'kycRejected',
  } as const)[kyc as 'APPROVED' | 'PENDING' | 'REJECTED'] ?? 'kycNone';
  alerts.push({ kind: kycKind, vars: {}, at: (user?.updatedAt ?? new Date()).toISOString() });

  for (const d of discounts.slice(0, 1)) {
    alerts.push({ kind: 'discount', vars: { percent: d.percent, code: d.code }, at: new Date().toISOString() });
  }
  for (const p of payouts) {
    if (p.status === 'PAID')
      alerts.push({ kind: 'payoutPaid', vars: { amount: p.amount }, at: (p.processedAt ?? p.createdAt).toISOString() });
    else if (p.status === 'REQUESTED' || p.status === 'APPROVED')
      alerts.push({ kind: 'payoutPending', vars: { amount: p.amount }, at: p.createdAt.toISOString() });
  }
  for (const a of accounts) {
    alerts.push({
      kind: a.status === 'PASSED' ? 'passed' : 'failed',
      vars: { number: a.accountNumber },
      at: a.updatedAt.toISOString(),
    });
  }
  return alerts.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 5);
}

export type TradeStats = {
  trades: number;
  winRate: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  best: number;
  worst: number;
  avgHoldMinutes: number;
  equity: Array<{ at: string; value: number }>;
  byDay: Array<{ day: string; pnl: number }>;
};

/** Closed-trade statistics for the analysis panel. */
export async function getTradeStats(accountId: string): Promise<TradeStats> {
  const trades = await prisma.trade.findMany({
    where: { accountId, closedAt: { not: null } },
    orderBy: { closedAt: 'asc' },
    select: { profit: true, openedAt: true, closedAt: true },
  });
  const wins = trades.filter((t) => t.profit > 0);
  const losses = trades.filter((t) => t.profit < 0);
  const grossWin = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
  const hold = trades.reduce(
    (s, t) => s + ((t.closedAt as Date).getTime() - t.openedAt.getTime()),
    0,
  );

  let running = 0;
  const equity = trades.map((t) => {
    running += t.profit;
    return { at: (t.closedAt as Date).toISOString(), value: Math.round(running * 100) / 100 };
  });
  const dayMap = new Map<string, number>();
  for (const t of trades) {
    const key = (t.closedAt as Date).toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + t.profit);
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    trades: trades.length,
    winRate: trades.length ? Math.round((wins.length / trades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? r2(grossWin / grossLoss) : wins.length ? null : 0,
    avgWin: wins.length ? r2(grossWin / wins.length) : 0,
    avgLoss: losses.length ? r2(-grossLoss / losses.length) : 0,
    best: trades.length ? r2(Math.max(...trades.map((t) => t.profit))) : 0,
    worst: trades.length ? r2(Math.min(...trades.map((t) => t.profit))) : 0,
    avgHoldMinutes: trades.length ? Math.round(hold / trades.length / 60_000) : 0,
    equity,
    byDay: Array.from(dayMap, ([day, pnl]) => ({ day, pnl: r2(pnl) })),
  };
}
