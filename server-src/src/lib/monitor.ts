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
  /**
   * How much is still owed on an objective, for rules that are worked *towards*
   * rather than stayed under.
   *
   * `limit - used` does not answer this once an account is under water. A
   * $1,000 account chasing a 10% target has to reach a balance of $1,100; at
   * $990 it still needs $110, not the $100 the headline target says. Carried
   * explicitly so no caller has to rediscover that.
   */
  remaining?: number;
};

export type AccountSnapshot = {
  startingBalance: number;
  balance: number;
  equity: number;
  phase: string;
  status: string;
  /**
   * When the account was handed to the trader.
   *
   * Rules that look at behaviour rather than at money — the cooldown in
   * particular — must not judge trades that happened before the account
   * existed on this platform. A demo login that was traded for a week before
   * being linked used to arrive with a full history and fail on its first sync.
   */
  openedAt?: Date | null;
  /**
   * How many positions the terminal reported as open at the moment of the
   * snapshot. Passed explicitly rather than counted from the trade list so the
   * floating rule cannot be fooled by a history row that lost its close time.
   */
  openPositions?: number | null;
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
  /**
   * The same floors for balance.
   *
   * The published rules bind both figures: "a drop in balance OR a drop in
   * equity must not pass that number". They are not interchangeable — a losing
   * position closing pulls balance down while a second, winning position keeps
   * equity above it, so a balance breach can happen with equity still healthy.
   */
  dayLowBalance?: number | null;
  lowestBalance?: number | null;
  /** Largest combined floating loss seen while a position was open. */
  worstFloating?: number | null;
  /**
   * That same peak as a share of the equity it was measured against.
   *
   * The allowance is a percentage of *live* equity, so a peak recorded only in
   * dollars cannot be judged later against a different equity — an account that
   * has grown since would be held to the old, smaller allowance.
   */
  worstFloatingPct?: number | null;
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
  /**
   * The balance the account has to reach to complete its current stage.
   *
   * The objective is a balance, not a withdrawal: a $1,000 account on a 10%
   * target passes at $1,100. Zero once there is nothing left to chase — a
   * funded account has no target.
   */
  targetBalance: number;
  /** Still needed to reach `targetBalance`. Zero once it has been reached. */
  targetRemaining: number;
  /** The target percentage in force for this phase — P1 and P2 differ. */
  targetPct: number;
  phase: string;
  status: 'ACTIVE' | 'PASSED' | 'FAILED' | 'FUNDED' | 'DISABLED';
  rules: RuleItem[];
  breaches: RuleKey[];
  warnings: RuleKey[];
  voidedProfit: number;
  /** Unrealised profit or loss across every open position. */
  floatingPnl: number;
  openPositions: number;
  closedTrades: number;
  checkedAt: string;
  source: string;
  /**
   * Age of the underlying terminal data, in milliseconds, when it is known.
   *
   * A verdict computed from an hour-old snapshot is not the same claim as one
   * computed from a snapshot taken seconds ago, and the panel must be able to
   * say so rather than showing a confident green wall over dead data.
   */
  dataAgeMs?: number | null;
  stale?: boolean;
};

export const MONITOR_DEFAULTS: MonitorSettings = {
  consistencyRulePercent: 50,
  fundedMinTradingDays: 15,
  hftCooldownMinutes: 5,
  minHoldSeconds: 60,
  allowedSymbols: ['XAUUSD'],
  dayResetUtcOffset: 0,
  weekendHoldingAllowed: true,
  newsTradingAllowed: false,
};

const MS_MIN = 60_000;

/**
 * How much of an allowance has been used, as a percentage.
 *
 * Deliberately *not* capped at 100. A trader who blew twice their daily limit
 * has used 200%, and rounding that down to 100 hides how bad the breach was
 * from the support agent reading the report. The progress bar clamps its own
 * width; the number stays honest.
 */
function pct(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.max(0, (part / whole) * 100);
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

/**
 * The highest point each day's running profit reached.
 *
 * Not the day's closing total. The consistency rule raises the target once a
 * day goes over its cap, and states plainly that a loss taken later the same
 * day does not bring that adjustment back down -- so the figure has to be the
 * peak the day touched, not what it settled at.
 */
function dailyProfitPeaks(
  trades: MonitorTrade[],
  offsetHours: number,
): Map<string, number> {
  const byDay = new Map<string, MonitorTrade[]>();
  for (const t of trades) {
    if (!t.closedAt) continue;
    const key = dayKey(t.closedAt, offsetHours);
    const list = byDay.get(key);
    if (list) list.push(t);
    else byDay.set(key, [t]);
  }

  const peaks = new Map<string, number>();
  for (const [key, list] of byDay) {
    list.sort(
      (a, b) => (a.closedAt as Date).getTime() - (b.closedAt as Date).getTime(),
    );
    let running = 0;
    let peak = 0;
    for (const t of list) {
      running += t.profit;
      if (running > peak) peak = running;
    }
    peaks.set(key, peak);
  }
  return peaks;
}

/** Total profit disregarded because it came from sub-minute winners. */
export function voidedProfit(trades: MonitorTrade[], minHoldSeconds: number): number {
  let total = 0;
  for (const t of trades) {
    total += t.profit - countableProfitOf(t, minHoldSeconds);
  }
  return total;
}

export type CooldownResult = {
  /** How many positions were opened inside a cooldown window. */
  count: number;
  /** When the first of them was opened, for the breach record. */
  firstAt: Date | null;
  /** Minutes actually waited before the earliest offending entry. */
  waitedMinutes: number | null;
};

/**
 * Positions opened before the cooldown elapsed after a losing close.
 *
 * Two guards matter here and both were missing:
 *
 *   `openedAt > since`  — trades made before the account was issued are not the
 *                         trader's conduct on this challenge. Without this, an
 *                         imported history failed the account on its first sync.
 *   `opened > loss`     — a position already running when the loss closed was
 *                         not opened *in reaction* to it. Hedged legs entered
 *                         together must not punish each other.
 *
 * The window is measured from the moment the losing position closed, which is
 * the moment the trader learns the result.
 */
function cooldownViolations(
  trades: MonitorTrade[],
  cooldownMinutes: number,
  minHoldSeconds: number,
  since: Date | null,
): CooldownResult {
  const none: CooldownResult = { count: 0, firstAt: null, waitedMinutes: null };
  if (!(cooldownMinutes > 0)) return none;

  // Only a losing trade that was *also* under the minimum hold starts the
  // clock. The rule targets rapid re-entry after a sub-minute stop-out, not
  // every losing trade -- counting all of them made an ordinary session look
  // like abuse and failed four healthy accounts on their first sync.
  const losses = trades
    .filter((t) => {
      if (!t.closedAt || t.profit >= 0) return false;
      const held = (t.closedAt.getTime() - t.openedAt.getTime()) / 1000;
      return held < minHoldSeconds;
    })
    .map((t) => (t.closedAt as Date).getTime())
    .sort((a, b) => a - b);
  if (losses.length === 0) return none;

  const floor = since ? since.getTime() : Number.NEGATIVE_INFINITY;
  const window = cooldownMinutes * MS_MIN;

  let count = 0;
  let firstAt: number | null = null;
  let waited: number | null = null;

  for (const t of trades) {
    const opened = t.openedAt.getTime();
    if (opened < floor) continue;

    // The most recent loss that closed before this entry.
    let previous: number | null = null;
    for (const loss of losses) {
      if (loss < opened) previous = loss;
      else break;
    }
    if (previous === null) continue;

    const gap = opened - previous;
    if (gap >= window) continue;

    count += 1;
    if (firstAt === null || opened < firstAt) {
      firstAt = opened;
      waited = gap / MS_MIN;
    }
  }

  return {
    count,
    firstAt: firstAt === null ? null : new Date(firstAt),
    waitedMinutes: waited === null ? null : Math.round(waited * 10) / 10,
  };
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
  //
  // There is deliberately no "countable" day map any more. Sub-minute wins are
  // kept out of the target but the rules keep them inside consistency, so the
  // consistency figure is built from gross profit in dailyProfitPeaks.
  const byDay = sumByDay(trades, settings.dayResetUtcOffset, (t) => t.profit);
  const voided = voidedProfit(trades, settings.minHoldSeconds);
  const openTrades = trades.filter((t) => !t.closedAt);
  // The terminal's own count wins when the caller supplies it; the trade list
  // is only a fallback. A history row whose close time went missing would
  // otherwise read as an open position and switch on the floating rule.
  const openCount = account.openPositions ?? openTrades.length;
  const floatingPnl = openTrades.reduce((sum, t) => sum + t.profit, 0);

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
  const baseTarget = S * (targetPct / 100);

  // The lowest point actually reached, not merely the value a poll caught.
  //
  // Balance and equity are both bound by the rules, and the lower of the two is
  // what the floor has to be measured against. Watching equity alone misses the
  // case the rules spell out: a losing position closes and pulls balance under
  // the line while another open winner holds equity above it.
  const dayFloor = Math.min(
    E,
    account.dayLowEquity ?? E,
    B,
    account.dayLowBalance ?? B,
  );
  const everFloor = Math.min(
    E,
    account.lowestEquity ?? E,
    B,
    account.lowestBalance ?? B,
  );

  // ── Daily drawdown ───────────────────────────────────────
  // Allowance = the limit percentage of the balance the day STARTED with, and
  // the floor is measured from that same balance.
  //
  // Both halves used to read from the account's original capital instead, which
  // froze the allowance at its opening size: an account that grew from 10,000 to
  // 50,000 was still being held to 500 a day when the rules give it 2,500.
  const todayRealised =
    byDay.get(dayKey(new Date(), settings.dayResetUtcOffset)) ?? 0;
  const dayStartBalance = account.dayStartBalance ?? B - todayRealised;
  const dailyLimit = dayStartBalance * (challenge.dailyDrawdown / 100);
  const dailyLoss = Math.max(0, dayStartBalance - dayFloor);

  // ── Overall drawdown from the initial balance ────────────
  // Static, by design: the floor stays at a fixed percentage below the opening
  // capital however far the account grows.
  const maxLimit = S * (challenge.maxDrawdown / 100);
  const totalLoss = Math.max(0, S - everFloor);

  // ── Floating risk ────────────────────────────────────────
  // Only bites once a second position is open. A trader running a single
  // position is governed by the daily drawdown alone, and may take it all the
  // way to that limit; it is concentrated multi-position exposure this rule
  // exists to catch.
  // Measured against the equity the account has right now, not the capital it
  // opened with. The published rule is explicit that this is dynamic: an
  // account up 20% carries a proportionally larger allowance, and one that is
  // down carries less.
  const floatLimit = Math.max(0, E) * (challenge.floatingRisk / 100);
  // The worst exposure the agent saw while two or more positions were open,
  // never less than what is open right now. A breach that has already happened
  // stays a breach even after the positions recover or close.
  // Nothing counts below two open positions, so the figure is simply zero then
  // — which reads as "within limit" like every other rule, rather than as a
  // switched-off rule. OFF is reserved for a limit of zero.
  // Every open position counts, from the first.
  //
  // A two-position minimum was applied here on an earlier reading of the rule.
  // The published text sets no such condition — it binds "the combined loss of
  // open trades at any moment" — so a single position running past the
  // allowance is a breach like any other.
  const floatingNow = openCount >= 1 ? Math.max(0, B - E) : 0;
  // Judged as a ratio, which is what the rule actually says: the worst point is
  // compared against the equity it happened at, not the equity now.
  const floatingNowPct = openCount >= 1 && E > 0 ? (floatingNow / E) * 100 : 0;
  const floatingPeakPct = Math.max(floatingNowPct, account.worstFloatingPct ?? 0);
  // `worstFloating` is only meaningful once it is recorded under the same
  // two-position condition, which is now enforced where it is written
  // (see watermarks.ts). Before that fix it accumulated single-position floats,
  // which is why this gauge could read 64% on an account with nothing open.
  // The mark stays sticky on purpose: a breach that happened between two polls
  // is still a breach after the positions close.
  // Shown in dollars against today's equity so the gauge reads naturally, but
  // derived from the ratio so the comparison with the limit stays exact.
  const floatingLoss = Math.max(
    (floatingPeakPct / 100) * Math.max(0, E),
    floatingNow,
    account.worstFloating ?? 0,
  );
  // Distinguishes "this is happening now" from "this is the worst mark on
  // record", so a figure against a flat account cannot be misread as live risk.
  const floatingHistoric = openCount === 0 && floatingLoss > 0;

  // ── Trading days ─────────────────────────────────────────
  // A day counts once a trade has been opened *and closed* on it, which is what
  // the rules require: a completed round trip, not merely a position left
  // running. Counting from the open credited a day to an account that opened a
  // position and never touched it again.
  const tradingDays = new Set(
    trades
      .filter((t) => t.closedAt)
      .map((t) => dayKey(t.closedAt as Date, settings.dayResetUtcOffset)),
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
  // The best day is the highest point that day's profit *reached*, not what it
  // closed at. The rules are explicit that a loss taken later in the same day
  // does not undo a day that went over the cap, so an end-of-day net would let
  // the adjustment be traded away.
  //
  // Gross profit, deliberately: sub-minute wins are excluded from the target
  // but the rules keep them inside the consistency figure.
  const dayPeaks = dailyProfitPeaks(trades, settings.dayResetUtcOffset);
  const bestDay = dayPeaks.size ? Math.max(...dayPeaks.values(), 0) : 0;
  const consistencyCap = baseTarget * (settings.consistencyRulePercent / 100);

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
  const cooldown = cooldownViolations(
    trades,
    settings.hftCooldownMinutes,
    settings.minHoldSeconds,
    account.openedAt ?? null,
  );

  // ── Consistency, and the target it moves ─────────────────
  // Going over the daily cap does not fail anything. The rules say the target
  // is raised instead, by exactly enough to put the big day back at the cap:
  // a 35 day against a 25 cap on a 50 target lifts the target to 70.
  //
  // The engine used to treat this as a hard rule measured against total profit
  // and fail the account at the finish line -- a different rule altogether, and
  // one no trader was ever told about.
  const share = settings.consistencyRulePercent / 100;
  const targetAmount =
    share > 0 && bestDay > consistencyCap && baseTarget > 0
      ? Math.round((bestDay / share) * 100) / 100
      : baseTarget;
  const targetRaised = targetAmount > baseTarget;

  // ── What the target actually asks for ────────────────────
  // A balance, not a withdrawal. The published rules put it as "grow the
  // account to $1,100", and that is also how a trader reads it: the objective is
  // a level the balance has to reach, and a loss pushes that level further away.
  //
  // The engine already measured profit as `balance - startingBalance`, which is
  // the same arithmetic — but it then reported `Math.max(0, profit)`, so every
  // losing account showed "$0 of $100" no matter how far under water it was. A
  // trader at $990 was told they needed $100 more when they needed $110, and one
  // at $900 was told the same thing again. What is owed is measured from where
  // the balance actually is.
  const targetBalance = targetAmount > 0 ? S + targetAmount : 0;
  const countableBalance = S + countableProfit;
  const targetRemaining =
    targetAmount > 0 ? Math.max(0, targetBalance - countableBalance) : 0;

  const targetReached = targetPct === 0 || countableProfit >= targetAmount;
  const targetMet = targetReached && openCount === 0;

  const rules: RuleItem[] = [
    {
      key: 'PROFIT_TARGET',
      severity: 'TARGET',
      state: targetMet ? 'MET' : 'OK',
      // Not clamped at zero. Ground lost is part of the answer to "how far am
      // I from passing", and hiding it is what made this rule read wrong.
      used: countableProfit,
      limit: targetAmount,
      usedPct: targetAmount > 0 ? pct(countableProfit, targetAmount) : 100,
      remaining: targetRemaining,
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
      state: limitState(floatingLoss, floatLimit),
      used: floatingLoss,
      limit: floatLimit,
      usedPct: pct(floatingLoss, floatLimit),
      unit: 'usd',
      // `open:N` is how many positions are running right now; `peak:N` marks a
      // figure that is the worst on record rather than live exposure. The panel
      // turns these into a sentence — they are never shown raw.
      detail: floatingHistoric ? `peak:${openCount}` : `open:${openCount}`,
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
      // Informational. It never fails an account -- it moves the finish line.
      //
      // Exceeding the daily cap raises the profit target instead, by exactly
      // enough to put the big day back at the cap. `used` is the best day's
      // peak and `limit` is what a single day may contribute, so the gauge
      // reads as "how much of one day's allowance has been taken".
      key: 'CONSISTENCY',
      severity: 'INFO',
      state:
        settings.consistencyRulePercent <= 0 || baseTarget <= 0
          ? 'OFF'
          : targetRaised
            ? 'WARN'
            : 'OK',
      used: bestDay,
      limit: consistencyCap,
      usedPct: pct(bestDay, consistencyCap),
      unit: 'usd',
      // `raised:<new target>` -- the panel turns this into a sentence telling
      // the trader what they now have to reach.
      detail: targetRaised ? `raised:${targetAmount.toFixed(2)}` : undefined,
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
      // Informational rules have no allowance to fill, so they report no gauge
      // at all. A full bar here read as "100% breached" when it only ever meant
      // "some trades were short".
      usedPct: 0,
      unit: 'count',
    },
    {
      // A warning, not a verdict.
      //
      // The published rule says a trader who re-enters too soon after a
      // sub-minute stop-out is emailed, and that repeated abuse may lead to a
      // manual review. It does not fail the account outright, which is what the
      // engine was doing -- and what closed four accounts that had breached
      // nothing else.
      key: 'HFT_COOLDOWN',
      severity: 'INFO',
      state:
        settings.hftCooldownMinutes <= 0
          ? 'OFF'
          : cooldown.count
            ? 'WARN'
            : 'OK',
      used: cooldown.count,
      limit: 0,
      usedPct: cooldown.count ? 100 : 0,
      unit: 'count',
      // `waited:<minutes>|<iso>` — the panel renders the actual gap the trader
      // left and when it happened, so a failed account carries its evidence
      // instead of just a rule name.
      detail: cooldown.count
        ? `waited:${cooldown.waitedMinutes ?? 0}|${cooldown.firstAt?.toISOString() ?? ''}`
        : undefined,
    },
  ];

  const breaches = rules
    .filter((r) => r.severity === 'HARD' && r.state === 'BREACH')
    .map((r) => r.key);
  const warnings = rules
    .filter((r) => (r.severity === 'SOFT' || r.severity === 'HARD') && r.state === 'WARN')
    .map((r) => r.key);

  let status: AccountReport['status'];
  if (account.status === 'DISABLED' || account.status === 'FAILED') {
    status = account.status;
  } else if (breaches.length) {
    status = 'FAILED';
  } else if (funded) {
    status = 'FUNDED';
  } else if (
    targetMet &&
    tradingDays >= daysRequired &&
    !rules.some((r) => r.severity === 'SOFT' && r.state === 'WARN')
  ) {
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
    targetBalance,
    targetRemaining,
    targetPct,
    phase: account.phase,
    status,
    rules,
    breaches,
    warnings,
    voidedProfit: voided,
    floatingPnl,
    openPositions: openCount,
    closedTrades: trades.length - openTrades.length,
    checkedAt: new Date().toISOString(),
    source,
  };
}
