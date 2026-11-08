// Every worked example from the published rules, run against the engine.
//
//   npx tsx scripts/test-rules-spec.ts
//
// The numbers here are not invented. Each one is taken from the rules page the
// trader reads, so a passing run means the engine and the published promise say
// the same thing. That is the property that was missing: the engine had drifted
// into enforcing rules nobody had been told about.
import {
  buildReport,
  MONITOR_DEFAULTS,
  type MonitorChallenge,
  type MonitorSettings,
  type MonitorTrade,
} from '../src/lib/monitor';

let passed = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    passed += 1;
    console.log(`✓ ${what}`);
  } else {
    failed += 1;
    console.log(`✗ ${what}\n    expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}

function near(what: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) {
    passed += 1;
    console.log(`✓ ${what}`);
  } else {
    failed += 1;
    console.log(`✗ ${what}\n    expected ${want}, got ${got}`);
  }
}

const SETTINGS: MonitorSettings = { ...MONITOR_DEFAULTS, dayResetUtcOffset: 0 };

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

/** A completed trade, held comfortably over the minimum by default. */
function trade(over: Partial<MonitorTrade> = {}): MonitorTrade {
  const openedAt = over.openedAt ?? hoursAgo(5);
  return {
    symbol: 'XAUUSD',
    profit: 0,
    openedAt,
    closedAt: over.closedAt ?? new Date(openedAt.getTime() + 90 * 60_000),
    ...over,
  };
}

/** Five separate closed days, so the minimum-days objective is satisfied. */
function fiveDays(profitEach = 0): MonitorTrade[] {
  return [1, 2, 3, 4, 5].map((d) =>
    trade({
      openedAt: daysAgo(d),
      closedAt: new Date(daysAgo(d).getTime() + 90 * 60_000),
      profit: profitEach,
    }),
  );
}

function run(opts: {
  startingBalance: number;
  balance: number;
  equity?: number;
  challenge?: Partial<MonitorChallenge>;
  settings?: Partial<MonitorSettings>;
  trades?: MonitorTrade[];
  dayStartBalance?: number | null;
  dayLowEquity?: number | null;
  dayLowBalance?: number | null;
  lowestEquity?: number | null;
  lowestBalance?: number | null;
  worstFloatingPct?: number | null;
  openPositions?: number;
  phase?: string;
}) {
  const challenge: MonitorChallenge = {
    profitTarget: 10,
    profitTargetP2: 5,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    floatingRisk: 2.5,
    minTradingDays: 5,
    ...opts.challenge,
  };
  const report = buildReport(
    {
      startingBalance: opts.startingBalance,
      balance: opts.balance,
      equity: opts.equity ?? opts.balance,
      dayStartBalance: opts.dayStartBalance ?? opts.startingBalance,
      dayLowEquity: opts.dayLowEquity ?? null,
      dayLowBalance: opts.dayLowBalance ?? null,
      lowestEquity: opts.lowestEquity ?? null,
      lowestBalance: opts.lowestBalance ?? null,
      worstFloating: null,
      worstFloatingPct: opts.worstFloatingPct ?? null,
      openedAt: daysAgo(30),
      openPositions: opts.openPositions,
      phase: opts.phase ?? 'PHASE_1',
      status: 'ACTIVE',
    },
    challenge,
    opts.trades ?? [],
    { ...SETTINGS, ...opts.settings },
    'test',
  );
  return {
    report,
    rule: (k: string) => report.rules.find((r) => r.key === k)!,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Daily drawdown: 5% of the balance the day STARTED with ──');
{
  // "if your balance at 00:00 broker time is 10,000, then a drop in balance or
  //  equity below 9,500 has touched the daily drawdown"
  const { rule } = run({ startingBalance: 10_000, balance: 10_000, dayStartBalance: 10_000 });
  near('allowance on a 10,000 day is 500', rule('DAILY_DRAWDOWN').limit, 500);
}
{
  // "on an account whose day-start balance is 50,000, the daily drawdown is
  //  2,500 and the lowest permitted point is 47,500"
  //
  // The account opened at 10,000 and grew. The allowance follows the day's
  // balance, not the opening capital -- the engine used to hold it at 500.
  const { rule } = run({ startingBalance: 10_000, balance: 50_000, dayStartBalance: 50_000 });
  near('allowance on a 50,000 day is 2,500', rule('DAILY_DRAWDOWN').limit, 2_500);
  near('floor sits 2,500 below the day start', 50_000 - rule('DAILY_DRAWDOWN').limit, 47_500);
}
{
  // "if equity at the start of the day is above balance -- balance 10,000,
  //  equity 10,300 -- the drawdown is still measured from the 10,000 balance"
  const { rule } = run({
    startingBalance: 10_000,
    balance: 10_000,
    equity: 10_300,
    dayStartBalance: 10_000,
  });
  near('a higher opening equity does not lift the allowance', rule('DAILY_DRAWDOWN').limit, 500);
}
{
  // Equity dipped to 9,499 during the day: one dollar past the line.
  const { rule, report } = run({
    startingBalance: 10_000,
    balance: 10_000,
    equity: 9_600,
    dayStartBalance: 10_000,
    dayLowEquity: 9_499,
  });
  check('equity through the floor breaches', rule('DAILY_DRAWDOWN').state, 'BREACH');
  check('and fails the account', report.status, 'FAILED');
}
{
  // Balance through the floor while equity stays above it -- a losing position
  // closed while another open winner held equity up. The rules bind both.
  const { rule, report } = run({
    startingBalance: 10_000,
    balance: 9_450,
    equity: 9_700,
    dayStartBalance: 10_000,
    dayLowBalance: 9_450,
    openPositions: 1,
  });
  check('balance through the floor breaches too', rule('DAILY_DRAWDOWN').state, 'BREACH');
  check('account failed', report.status, 'FAILED');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Overall drawdown: 10% of the opening balance, fixed ──');
{
  // "on a 10,000 account you may lose 1,000; below 9,000 the overall drawdown
  //  has been touched"
  const { rule } = run({ startingBalance: 10_000, balance: 10_000 });
  near('allowance is 1,000', rule('MAX_DRAWDOWN').limit, 1_000);
}
{
  // "in a 50,000 plan, balance and equity must not pass 45,000"
  const { rule, report } = run({
    startingBalance: 50_000,
    balance: 44_900,
    dayStartBalance: 50_000,
    lowestBalance: 44_900,
  });
  near('allowance is 5,000', rule('MAX_DRAWDOWN').limit, 5_000);
  check('44,900 is through the floor', rule('MAX_DRAWDOWN').state, 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // "if you make 2% on the account, your drawdown is 12%" -- the floor does not
  // follow the account up.
  const { rule } = run({
    startingBalance: 10_000,
    balance: 10_200,
    dayStartBalance: 10_200,
    lowestEquity: 10_000,
  });
  near('the floor stays at the opening capital', rule('MAX_DRAWDOWN').limit, 1_000);
  near('nothing used while the account is up', rule('MAX_DRAWDOWN').used, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Floating risk: 2.5% of live equity, from the first position ──');
{
  // "in a 100,000 account the permitted floating loss is 2,500"
  const { rule } = run({
    startingBalance: 100_000,
    balance: 100_000,
    equity: 100_000,
    openPositions: 1,
  });
  near('allowance is 2,500 on 100,000 equity', rule('FLOATING_RISK').limit, 2_500);
}
{
  // Dynamic: the allowance tracks equity, so an account up 20% carries more.
  const { rule } = run({
    startingBalance: 100_000,
    balance: 120_000,
    equity: 120_000,
    openPositions: 1,
  });
  near('allowance follows equity up to 3,000', rule('FLOATING_RISK').limit, 3_000);
}
{
  // A single position past the allowance. The engine required two before this,
  // which let one runner blow past the limit untouched.
  const { rule, report } = run({
    startingBalance: 100_000,
    balance: 100_000,
    equity: 97_400,
    dayStartBalance: 100_000,
    openPositions: 1,
  });
  near('the single position\'s loss is counted', rule('FLOATING_RISK').used, 2_600);
  check('one position can breach', rule('FLOATING_RISK').state, 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  const { rule } = run({
    startingBalance: 100_000,
    balance: 100_000,
    equity: 100_000,
    openPositions: 0,
  });
  near('nothing floating with no position open', rule('FLOATING_RISK').used, 0);
  check('within limit', rule('FLOATING_RISK').state, 'OK');
}
{
  // A spike that came and went between two pushes.
  //
  // The terminal samples every second and reports the worst share of equity it
  // saw. Without that, only the instant of the push counted -- so a position
  // that blew through the allowance and recovered inside five seconds left no
  // trace at all. "even if the trades are later closed at a profit."
  const { rule, report } = run({
    startingBalance: 100_000,
    balance: 100_000,
    equity: 100_000,
    dayStartBalance: 100_000,
    openPositions: 0,
    worstFloatingPct: 3.1,
  });
  check('a spike between pushes still breaches', rule('FLOATING_RISK').state, 'BREACH');
  near('reported against current equity', rule('FLOATING_RISK').used, 3_100);
  check('account failed', report.status, 'FAILED');
}
{
  // The peak is carried as a ratio, so an account that has grown since is
  // judged against the allowance it had at the time, not a stale dollar figure.
  const { rule } = run({
    startingBalance: 100_000,
    balance: 200_000,
    equity: 200_000,
    dayStartBalance: 200_000,
    openPositions: 0,
    worstFloatingPct: 2.0,
  });
  // 2 of an allowed 2.5 is 80% used, which the engine flags as a warning --
  // but it is not a breach, and that is the point: a stale dollar figure would
  // have judged it against the smaller allowance the account had before.
  check('a 2% peak does not breach a 2.5% allowance', rule('FLOATING_RISK').state !== 'BREACH', true);
  near('measured against the larger equity', rule('FLOATING_RISK').used, 4_000);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Consistency: raises the target, never fails the account ──');
{
  // The worked example: 1,000 account, 5% target = 50, daily cap = 25.
  // A 35 day lifts the final target to 70.
  const day = daysAgo(1);
  const { rule, report } = run({
    startingBalance: 1_000,
    balance: 1_035,
    dayStartBalance: 1_000,
    challenge: { profitTarget: 5 },
    trades: [trade({ openedAt: day, closedAt: new Date(day.getTime() + 3_600_000), profit: 35 })],
  });
  near('the daily cap is 25', rule('CONSISTENCY').limit, 25);
  near('the best day is 35', rule('CONSISTENCY').used, 35);
  near('the target is lifted to 70', rule('PROFIT_TARGET').limit, 70);
  check('consistency never breaches', rule('CONSISTENCY').state !== 'BREACH', true);
  check('the account is not failed', report.status, 'ACTIVE');
}
{
  // "a losing trade later the same day does not bring the adjusted target back
  //  down" -- the day peaked at 35 before giving 10 back.
  const day = daysAgo(1);
  const { rule } = run({
    startingBalance: 1_000,
    balance: 1_025,
    dayStartBalance: 1_000,
    challenge: { profitTarget: 5 },
    trades: [
      trade({ openedAt: day, closedAt: new Date(day.getTime() + 3_600_000), profit: 35 }),
      trade({ openedAt: day, closedAt: new Date(day.getTime() + 7_200_000), profit: -10 }),
    ],
  });
  near('the peak of 35 is what counts', rule('CONSISTENCY').used, 35);
  near('the raised target of 70 stands', rule('PROFIT_TARGET').limit, 70);
}
{
  // Inside the cap: the target is untouched.
  const day = daysAgo(1);
  const { rule } = run({
    startingBalance: 1_000,
    balance: 1_020,
    dayStartBalance: 1_000,
    challenge: { profitTarget: 5 },
    trades: [trade({ openedAt: day, closedAt: new Date(day.getTime() + 3_600_000), profit: 20 })],
  });
  near('a 20 day leaves the target at 50', rule('PROFIT_TARGET').limit, 50);
  check('and reads as OK', rule('CONSISTENCY').state, 'OK');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Minimum hold: profit voided, losses kept, consistency keeps both ──');
{
  const day = daysAgo(1);
  const quickWin = trade({
    openedAt: day,
    closedAt: new Date(day.getTime() + 30_000), // 30 seconds
    profit: 40,
  });
  const { rule } = run({
    startingBalance: 1_000,
    balance: 1_040,
    dayStartBalance: 1_000,
    challenge: { profitTarget: 5 },
    trades: [quickWin],
  });
  near('the sub-minute win is voided from progress', rule('PROFIT_TARGET').used, 0);
  // "profit from trades under a minute is not counted in the account, but IS
  //  counted in consistency"
  near('but still counts towards consistency', rule('CONSISTENCY').used, 40);
}
{
  const day = daysAgo(1);
  const quickLoss = trade({
    openedAt: day,
    closedAt: new Date(day.getTime() + 30_000),
    profit: -40,
  });
  const { report } = run({
    startingBalance: 1_000,
    balance: 960,
    dayStartBalance: 1_000,
    trades: [quickLoss],
  });
  near('a sub-minute loss counts in full', report.profit, -40);
  near('and is not voided', report.voidedProfit, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Cooldown: 5 minutes after a sub-minute stop-out ──');
{
  const t0 = hoursAgo(3);
  const { rule, report } = run({
    startingBalance: 1_000,
    balance: 990,
    dayStartBalance: 1_000,
    trades: [
      // a loss held two minutes (a sub-minute trade is a breach of its own)
      trade({ openedAt: new Date(t0.getTime() - 90_000), closedAt: new Date(t0.getTime() + 30_000), profit: -10 }),
      // back in after 3 minutes
      trade({ openedAt: new Date(t0.getTime() + 210_000), profit: 0 }),
    ],
  });
  check('re-entering after 3 minutes is flagged', rule('HFT_COOLDOWN').state, 'WARN');
  // The published rule warns and may lead to a manual review. It does not fail.
  check('but the account is not failed', report.status, 'ACTIVE');
}
{
  const t0 = hoursAgo(3);
  const { rule } = run({
    startingBalance: 1_000,
    balance: 990,
    dayStartBalance: 1_000,
    trades: [
      trade({ openedAt: new Date(t0.getTime() - 90_000), closedAt: new Date(t0.getTime() + 30_000), profit: -10 }),
      trade({ openedAt: new Date(t0.getTime() + 6 * 60_000), profit: 0 }),
    ],
  });
  check('waiting 6 minutes is fine', rule('HFT_COOLDOWN').state, 'OK');
}
{
  // Propyar: every losing trade starts the clock, however long it was held.
  // Safe because the cooldown only warns; it never fails the account.
  const t0 = hoursAgo(3);
  const { rule } = run({
    startingBalance: 1_000,
    balance: 990,
    dayStartBalance: 1_000,
    trades: [
      trade({ openedAt: t0, closedAt: new Date(t0.getTime() + 20 * 60_000), profit: -10 }),
      trade({ openedAt: new Date(t0.getTime() + 21 * 60_000), profit: 0 }),
    ],
  });
  check('an ordinary loss starts the cooldown', rule('HFT_COOLDOWN').state, 'WARN');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Profit target and trading days ──');
{
  // "phase one requires 10% on a 10,000 account -- 1,000"
  const { rule } = run({ startingBalance: 10_000, balance: 10_000 });
  near('phase 1 target is 1,000', rule('PROFIT_TARGET').limit, 1_000);
}
{
  // "phase two requires 5% -- 500"
  const { rule } = run({ startingBalance: 10_000, balance: 10_000, phase: 'PHASE_2' });
  near('phase 2 target is 500', rule('PROFIT_TARGET').limit, 500);
}
{
  // The target is a balance to reach, not an amount to earn: a $1,000 account
  // on a 10% target passes at $1,100. What is still owed is measured from where
  // the balance stands, so ground lost pushes the finish line further away.
  const at = (balance: number, phase = 'PHASE_1') =>
    run({ startingBalance: 1_000, balance, phase });

  near('target balance is 1,100', at(1_000).report.targetBalance, 1_100);
  near('at the start, 100 to go', at(1_000).report.targetRemaining, 100);
  near('at 1,050, 50 to go', at(1_050).report.targetRemaining, 50);
  // The case that was wrong: a losing account was told it still needed exactly
  // the headline target, because profit was reported floored at zero.
  near('at 990, 110 to go', at(990).report.targetRemaining, 110);
  near('at 900, 200 to go', at(900).report.targetRemaining, 200);
  near('at 1,100, nothing to go', at(1_100).report.targetRemaining, 0);
  near('at 1,150, still nothing', at(1_150).report.targetRemaining, 0);
  check('reaching the balance meets the target', at(1_100).rule('PROFIT_TARGET').state, 'MET');
  check('one dollar short does not', at(1_099).rule('PROFIT_TARGET').state, 'OK');
  // Lost ground is reported as lost, not floored away.
  near('a loss shows as negative progress', at(990).rule('PROFIT_TARGET').used, -10);

  // Phase 2 asks 5% of the same capital: $1,050.
  near('phase 2 target balance is 1,050', at(1_000, 'PHASE_2').report.targetBalance, 1_050);
  near('phase 2 at 990 needs 60', at(990, 'PHASE_2').report.targetRemaining, 60);
  check('phase 2 target percent is 5', at(1_000, 'PHASE_2').report.targetPct, 5);
  check('phase 1 target percent is 10', at(1_000).report.targetPct, 10);
  // A funded account is not chasing anything.
  check('a funded account has no target', at(1_200, 'FUNDED').report.targetBalance, 0);
  check('and no target percent', at(1_200, 'FUNDED').report.targetPct, 0);
}
{
  // "a trading day counts when at least one trade was opened and closed in it"
  const { rule } = run({
    startingBalance: 1_000,
    balance: 1_000,
    trades: fiveDays(),
  });
  check('five closed days count', rule('MIN_TRADING_DAYS').used, 5);
  check('objective met', rule('MIN_TRADING_DAYS').state, 'MET');
}
{
  // A position left open all day is not a trading day.
  const { rule } = run({
    startingBalance: 1_000,
    balance: 1_000,
    trades: [{ symbol: 'XAUUSD', profit: 0, openedAt: daysAgo(1), closedAt: null }],
    openPositions: 1,
  });
  check('an open position earns no trading day', rule('MIN_TRADING_DAYS').used, 0);
}
{
  // "reaching the target before five trading days is not enough on its own"
  const { report } = run({
    startingBalance: 1_000,
    balance: 1_100,
    dayStartBalance: 1_000,
    trades: [trade({ openedAt: daysAgo(1), profit: 100 })],
  });
  check('target alone does not pass the stage', report.status, 'ACTIVE');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('');
if (failed === 0) {
  console.log(`✅ all ${passed} checks match the published rules.`);
} else {
  console.log(`❌ ${failed} of ${passed + failed} checks disagree with the published rules.`);
  process.exitCode = 1;
}
console.log('');
