// Automated rule monitoring.
//
// Pure computation: no database, no environment, no I/O. Everything it needs is
// passed in, which keeps the rules directly testable — see
// scripts/test-monitor.ts.
// Produces a full per-rule report for one trading account and fails the account
// when a hard rule is breached. Every threshold comes from the challenge row /
// admin rule settings, so the engine always mirrors the published rules page.

export type RuleKey =
  | 'PROFIT_TARGET'
  | 'DAILY_DRAWDOWN'
  | 'MAX_DRAWDOWN'
  | 'FLOATING_RISK'
  | 'MIN_TRADING_DAYS'
  | 'CONSISTENCY'
  | 'INSTRUMENT'
  | 'MIN_HOLD_TIME'
  | 'HFT_COOLDOWN';

/**
 * HARD   — breach fails the account immediately.
 * SOFT   — breach blocks passing / payout but keeps the account alive.
 * TARGET — an objective to reach, not a limit.
 * INFO   — reported for transparency; carries its own penalty elsewhere and
 *          never blocks progress on its own.
 */
export type RuleSeverity = 'HARD' | 'SOFT' | 'TARGET' | 'INFO';
/** `OFF` means the rule is not enforced for this account. */
export type RuleState = 'OK' | 'WARN' | 'BREACH' | 'MET' | 'OFF';
export type RuleUnit = 'usd' | 'percent' | 'days' | 'count';

export type RuleItem = {
  key: RuleKey;
  severity: RuleSeverity;
  state: RuleState;
  used: number;
  limit: number;
  usedPct: number; // 0..100 gauge fill
  unit: RuleUnit;
  detail?: string;
};

export type AccountSnapshot = {
  startingBalance: number;
  balance: number;
  equity: number;
  phase: string;
  status: string;
  /**
   * Worst points actually reached between pushes, sampled by the agent.
   *
   * Equity at the moment of a poll says nothing about what happened in the two
   * minutes before it. A trade that ran 10 down and closed 5 up is a real
   * drawdown of 10, and these fields are what make the engine see it. When they
   * are absent the engine falls back to the snapshot, which is the old,
   * poll-only behaviour.
   */
  dayLowEquity?: number | null;
  lowestEquity?: number | null;
  /** Largest combined floating loss seen while two or more positions were open. */
  worstFloating?: number | null;
  /**
   * Balance carried into the current trading day. Brokers measure the daily
   * limit from the balance recorded at the day's reset; when this is absent the
   * engine falls back to reconstructing it from today's closed trades.
   */
  dayStartBalance?: number | null;
};

export type MonitorChallenge = {
  profitTarget: number;
  profitTargetP2: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  floatingRisk: number;
  minTradingDays: number;
};

export type MonitorTrade = {
  symbol: string;
  profit: number;
  openedAt: Date;
  closedAt: Date | null;
};

export type MonitorSettings = {
  consistencyRulePercent: number;
  fundedMinTradingDays: number;
  hftCooldownMinutes: number;
  minHoldSeconds: number;
  allowedSymbols: string[];
  /** Hours to shift the trading-day boundary, to match the broker's server. */
  dayResetUtcOffset: number;
  // Policy flags shown on the rules page; not enforced by the engine.
  weekendHoldingAllowed: boolean;
  newsTradingAllowed: boolean;
};

export type AccountReport = {
  startingBalance: number;
  balance: number;
  equity: number;
  profit: number;
  profitPct: number;
  phase: string;
  status: 'ACTIVE' | 'PASSED' | 'FAILED' | 'FUNDED' | 'DISABLED';
  rules: RuleItem[];
  breaches: RuleKey[];
  warnings: RuleKey[];
  voidedProfit: number;
  checkedAt: string;
  source: string;
};

export const MONITOR_DEFAULTS: MonitorSettings = {
  consistencyRulePercent: 50,
  fundedMinTradingDays: 15,
  hftCooldownMinutes: 15,
  minHoldSeconds: 60,
  allowedSymbols: ['XAUUSD'],
  dayResetUtcOffset: 0,
  weekendHoldingAllowed: true,
  newsTradingAllowed: false,
};

const MS_MIN = 60_000;

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * State of a "stay under this" rule.
 *
 * A limit of zero or less means the rule is switched off for this account —
 * without this guard the `used >= limit` test would be true from the very first
 * moment and fail every account instantly.
 */
function limitState(used: number, limit: number): RuleState {
  if (!(limit > 0)) return 'OFF';
  if (used >= limit) return 'BREACH';
  if (used >= limit * 0.8) return 'WARN';
  return 'OK';
}

/**
 * Which trading day a moment belongs to.
 *
 * The daily drawdown must reset when the broker's day rolls over, not at UTC
 * midnight — `dayResetUtcOffset` shifts the boundary to the server's timezone
 * (e.g. 3 for a GMT+3 broker).
 */
export function dayKey(d: Date, offsetHours: number): string {
  return new Date(d.getTime() + offsetHours * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function normaliseSymbol(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Groups closed trades by the day they closed, summing whatever `value` says. */
function sumByDay(
  trades: MonitorTrade[],
  offsetHours: number,
  value: (t: MonitorTrade) => number,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    if (!t.closedAt) continue;
    const key = dayKey(t.closedAt, offsetHours);
    byDay.set(key, (byDay.get(key) ?? 0) + value(t));
  }
  return byDay;
}

/**
 * What a trade contributes towards the objectives.
 *
 * A winning trade held under the minimum simply does not exist as far as the
 * rules are concerned — not for the target, not for total profit, not for
 * consistency. A losing one counts in full: the trader keeps the damage.
 */
function countableProfitOf(t: MonitorTrade, minHoldSeconds: number): number {
  if (!t.closedAt || t.profit <= 0) return t.profit;
  const heldSeconds = (t.closedAt.getTime() - t.openedAt.getTime()) / 1000;
  return heldSeconds < minHoldSeconds ? 0 : t.profit;
}

/** Total profit disregarded because it came from sub-minute winners. */
function voidedProfit(trades: MonitorTrade[], minHoldSeconds: number): number {
  let total = 0;
  for (const t of trades) {
    total += t.profit - countableProfitOf(t, minHoldSeconds);
  }
  return total;
}

/** Trades opened before the cooldown elapsed after a losing close. */
function cooldownViolations(
  trades: MonitorTrade[],
  cooldownMinutes: number,
): number {
  const losses = trades
    .filter((t) => t.closedAt && t.profit < 0)
    .map((t) => (t.closedAt as Date).getTime())
    .sort((a, b) => a - b);
  if (losses.length === 0) return 0;

  const window = cooldownMinutes * MS_MIN;
  let count = 0;
  for (const t of trades) {
    const opened = t.openedAt.getTime();
    if (losses.some((loss) => opened > loss && opened - loss < window)) count++;
  }
  return count;
}

export function buildReport(
  account: AccountSnapshot,
  challenge: MonitorChallenge,
  trades: MonitorTrade[],
  settings: MonitorSettings,
  source: string,
): AccountReport {
  const S = account.startingBalance;
  const B = account.balance;
  const E = account.equity;
  const funded = account.phase === 'FUNDED';

  // Two different questions, so two different day maps.
  //
  //   byDay          — real money that moved. The broker's balance really did
  //                    change by this much, so the daily drawdown has to use it
  //                    to reconstruct where the day started.
  //   countableByDay — money that counts towards objectives. Sub-minute wins
  //                    are zeroed here, which is what keeps them out of the
  //                    consistency calculation as well as the target.
  const byDay = sumByDay(trades, settings.dayResetUtcOffset, (t) => t.profit);
  const countableByDay = sumByDay(trades, settings.dayResetUtcOffset, (t) =>
    countableProfitOf(t, settings.minHoldSeconds),
  );
  const voided = voidedProfit(trades, settings.minHoldSeconds);
  const openCount = trades.filter((t) => !t.closedAt).length;

  // ── Profit target ────────────────────────────────────────
  // Measured on the closed balance, not equity, and only once every position is
  // closed — floating profit is not profit until it is realised. This is the
  // industry convention and it stops an account passing on an open winner that
  // could still turn around.
  const grossProfit = B - S;
  const countableProfit = grossProfit - voided;
  const targetPct = funded
    ? 0
    : account.phase === 'PHASE_2'
      ? challenge.profitTargetP2
      : challenge.profitTarget;
  const targetAmount = S * (targetPct / 100);
  const targetReached = targetPct === 0 || countableProfit >= targetAmount;
  const targetMet = targetReached && openCount === 0;

  // The lowest equity actually reached, not merely the value a poll caught.
  // Falls back to the snapshot when an agent reports no samples.
  const dayFloor = Math.min(E, account.dayLowEquity ?? E);
  const everFloor = Math.min(E, account.lowestEquity ?? E);

  // ── Daily drawdown ───────────────────────────────────────
  // Floor = balance carried into the day − (limit % of the INITIAL balance).
  // The percentage is always of the initial capital, so the allowance does not
  // grow as the account grows; only the reference balance moves.
  const todayRealised =
    byDay.get(dayKey(new Date(), settings.dayResetUtcOffset)) ?? 0;
  const dayStartBalance = account.dayStartBalance ?? B - todayRealised;
  const dailyLimit = S * (challenge.dailyDrawdown / 100);
  const dailyLoss = Math.max(0, dayStartBalance - dayFloor);

  // ── Overall drawdown from the initial balance ────────────
  const maxLimit = S * (challenge.maxDrawdown / 100);
  const totalLoss = Math.max(0, S - everFloor);

  // ── Floating risk ────────────────────────────────────────
  // Only bites once a second position is open. A trader running a single
  // position is governed by the daily drawdown alone, and may take it all the
  // way to that limit; it is concentrated multi-position exposure this rule
  // exists to catch.
  const floatLimit = S * (challenge.floatingRisk / 100);
  // The worst exposure the agent saw while two or more positions were open,
  // never less than what is open right now. A breach that has already happened
  // stays a breach even after the positions recover or close.
  // Nothing counts below two open positions, so the figure is simply zero then
  // — which reads as "within limit" like every other rule, rather than as a
  // switched-off rule. OFF is reserved for a limit of zero.
  const floatingNow = openCount >= 2 ? Math.max(0, B - E) : 0;
  const floatingLoss = Math.max(floatingNow, account.worstFloating ?? 0);

  // ── Trading days ─────────────────────────────────────────
  // A day counts when a trade was *placed* on it, by the broker's clock. Days
  // are counted from the open, not the close, so a position carried overnight
  // does not earn a second day for doing nothing.
  const tradingDays = new Set(
    trades.map((t) => dayKey(t.openedAt, settings.dayResetUtcOffset)),
  ).size;
  const daysRequired = funded
    ? settings.fundedMinTradingDays
    : challenge.minTradingDays;

  // ── Consistency ──────────────────────────────────────────
  // The industry formula: best day / total profit. A trader who makes their
  // whole target in one session has not shown a repeatable edge, however large
  // the total. Firms that run this rule set the cap between 30% and 50%.
  //
  // Measuring against the *target* instead was tried and is wrong: it makes the
  // rule harsher the more a trader earns, and it cannot be applied at all to a
  // funded account, which has no target.
  //
  // Sub-minute profit is excluded from both sides: a voided win is treated as
  // though it never happened, so it cannot make a day look concentrated either.
  const bestDay = countableByDay.size
    ? Math.max(...countableByDay.values(), 0)
    : 0;
  const consistencyShare =
    countableProfit > 0 ? (bestDay / countableProfit) * 100 : 0;

  // ── Instrument restriction ───────────────────────────────
  const allowed = settings.allowedSymbols.map(normaliseSymbol);
  const offending = Array.from(
    new Set(
      trades
        .map((t) => normaliseSymbol(t.symbol))
        .filter((s) => s && !allowed.some((a) => s.startsWith(a))),
    ),
  );

  // ── Sub-minute trades & HFT cooldown ─────────────────────
  const shortTrades = trades.filter(
    (t) =>
      t.closedAt &&
      (t.closedAt.getTime() - t.openedAt.getTime()) / 1000 <
        settings.minHoldSeconds,
  ).length;
  const cooldownHits = cooldownViolations(trades, settings.hftCooldownMinutes);

  const rules: RuleItem[] = [
    {
      key: 'PROFIT_TARGET',
      severity: 'TARGET',
      state: targetMet ? 'MET' : 'OK',
      used: Math.max(0, countableProfit),
      limit: targetAmount,
      usedPct: targetAmount > 0 ? pct(countableProfit, targetAmount) : 100,
      unit: 'usd',
      // Reached on paper but still holding trades — say so, rather than leaving
      // the trader wondering why a full gauge has not passed the stage.
      detail: targetReached && openCount > 0 ? 'open' : undefined,
    },
    {
      key: 'DAILY_DRAWDOWN',
      severity: 'HARD',
      state: limitState(dailyLoss, dailyLimit),
      used: dailyLoss,
      limit: dailyLimit,
      usedPct: pct(dailyLoss, dailyLimit),
      unit: 'usd',
    },
    {
      key: 'MAX_DRAWDOWN',
      severity: 'HARD',
      state: limitState(totalLoss, maxLimit),
      used: totalLoss,
      limit: maxLimit,
      usedPct: pct(totalLoss, maxLimit),
      unit: 'usd',
    },
    {
      key: 'FLOATING_RISK',
      severity: 'HARD',
      // OFF below two open positions — the rule simply does not apply yet.
      state: limitState(floatingLoss, floatLimit),
      used: floatingLoss,
      limit: floatLimit,
      usedPct: pct(floatingLoss, floatLimit),
      unit: 'usd',
      // How many positions are open right now, so the trader can see why the
      // figure is what it is.
      detail: String(openCount),
    },
    {
      key: 'MIN_TRADING_DAYS',
      severity: 'TARGET',
      state: tradingDays >= daysRequired ? 'MET' : 'OK',
      used: tradingDays,
      limit: daysRequired,
      usedPct: pct(tradingDays, daysRequired),
      unit: 'days',
    },
    {
      key: 'CONSISTENCY',
      // Judged at the finish line, the way firms actually run it: the question
      // is whether the *completed* result came from a repeatable edge.
      //
      // Checking it continuously would be nonsense — a trader whose first
      // winning day is their only winning day sits at 100% by arithmetic, and
      // would be failed for having started. So while the target is still out of
      // reach a concentrated run only warns; it ends the challenge at the
      // moment the trader would otherwise pass.
      severity: 'HARD',
      state:
        settings.consistencyRulePercent <= 0
          ? 'OFF'
          : consistencyShare < settings.consistencyRulePercent
            ? 'OK'
            : targetMet
              ? 'BREACH'
              : 'WARN',
      used: consistencyShare,
      limit: settings.consistencyRulePercent,
      usedPct: pct(consistencyShare, settings.consistencyRulePercent),
      unit: 'percent',
    },
    {
      key: 'INSTRUMENT',
      severity: 'HARD',
      // An empty allow-list means every instrument is permitted, not none.
      state: !allowed.length ? 'OFF' : offending.length ? 'BREACH' : 'OK',
      used: offending.length,
      limit: 0,
      usedPct: offending.length ? 100 : 0,
      unit: 'count',
      detail: offending.join(', ') || undefined,
    },
    {
      // Informational: the penalty is that these profits are already voided
      // above, so it must not also block the account from passing.
      key: 'MIN_HOLD_TIME',
      severity: 'INFO',
      state: settings.minHoldSeconds <= 0 ? 'OFF' : shortTrades ? 'WARN' : 'OK',
      used: shortTrades,
      limit: 0,
      usedPct: shortTrades ? 100 : 0,
      unit: 'count',
    },
    {
      key: 'HFT_COOLDOWN',
      severity: 'HARD',
      state:
        settings.hftCooldownMinutes <= 0
          ? 'OFF'
          : cooldownHits
            ? 'BREACH'
            : 'OK',
      used: cooldownHits,
      limit: 0,
      usedPct: cooldownHits ? 100 : 0,
      unit: 'count',
    },
  ];

  const breaches = rules
    .filter((r) => r.severity === 'HARD' && r.state === 'BREACH')
    .map((r) => r.key);
  const warnings = rules
    .filter((r) => r.severity === 'SOFT' && r.state === 'WARN')
    .map((r) => r.key);

  let status: AccountReport['status'];
  if (account.status === 'DISABLED' || account.status === 'FAILED') {
    status = account.status;
  } else if (breaches.length) {
    status = 'FAILED';
  } else if (funded) {
    status = 'FUNDED';
  } else if (targetMet && tradingDays >= daysRequired && !warnings.length) {
    status = 'PASSED';
  } else {
    status = 'ACTIVE';
  }

  return {
    startingBalance: S,
    balance: B,
    equity: E,
    profit: grossProfit,
    profitPct: S > 0 ? (grossProfit / S) * 100 : 0,
    phase: account.phase,
    status,
    rules,
    breaches,
    warnings,
    voidedProfit: voided,
    checkedAt: new Date().toISOString(),
    source,
  };
}
