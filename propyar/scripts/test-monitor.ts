// Rule-engine regression suite.
//   npx tsx scripts/test-monitor.ts
//
// Every hard rule gets the same four probes — below the limit, exactly on it,
// above it, and switched off — because the boundary is where money is won and
// lost and it is the case nobody tests by hand. The scenarios that caused real
// misfires in production are kept at the bottom, named after what went wrong.
import {
  buildReport,
  MONITOR_DEFAULTS,
  type AccountSnapshot,
  type MonitorChallenge,
  type MonitorSettings,
  type MonitorTrade,
} from '../src/lib/monitor';
import { nextWatermarks } from '../src/lib/watermarks';
import { dayKey } from '../src/lib/monitor';

const CHALLENGE: MonitorChallenge = {
  profitTarget: 10,
  profitTargetP2: 5,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  floatingRisk: 2.5,
  minTradingDays: 5,
};

const SETTINGS: MonitorSettings = { ...MONITOR_DEFAULTS };

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

/** Long before any trade in these fixtures, so `openedAt` never filters them. */
const ISSUED = daysAgo(90);

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected);
  if (ok) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.log(`✗ ${label}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function trade(over: Partial<MonitorTrade> = {}): MonitorTrade {
  const openedAt = over.openedAt ?? hoursAgo(5);
  return {
    symbol: 'XAUUSD',
    profit: 100,
    openedAt,
    closedAt: over.closedAt ?? new Date(openedAt.getTime() + 90 * 60_000),
    ...over,
  };
}

/** Five separate trading days, each a clean 90-minute trade. */
function fiveGoodDays(profitEach: number): MonitorTrade[] {
  return [1, 2, 3, 4, 5].map((d) =>
    trade({
      openedAt: daysAgo(d),
      closedAt: new Date(daysAgo(d).getTime() + 5_400_000),
      profit: profitEach,
    }),
  );
}

function run(
  label: string,
  input: Partial<AccountSnapshot> & {
    trades?: MonitorTrade[];
    settings?: Partial<MonitorSettings>;
    challenge?: Partial<MonitorChallenge>;
  },
) {
  const report = buildReport(
    {
      startingBalance: 10_000,
      balance: 10_000,
      equity: 10_000,
      phase: 'PHASE_1',
      status: 'ACTIVE',
      openedAt: ISSUED,
      ...input,
    },
    { ...CHALLENGE, ...input.challenge },
    input.trades ?? [],
    { ...SETTINGS, ...input.settings },
    'test',
  );
  console.log(`\n  · ${label}`);
  return {
    report,
    state: (key: string) => report.rules.find((r) => r.key === key)?.state,
    used: (key: string) => report.rules.find((r) => r.key === key)?.used,
    detail: (key: string) => report.rules.find((r) => r.key === key)?.detail,
  };
}

// ═══════════════════════════════════════════════════════════
console.log('\n── daily drawdown: boundary probes ──');
// Limit is 5% of the 10,000 initial balance = 500.
{
  const { state } = run('loss of 499 — one dollar inside', {
    balance: 9_501,
    equity: 9_501,
    dayStartBalance: 10_000,
    dayLowEquity: 9_501,
  });
  check('below limit → not breached', state('DAILY_DRAWDOWN'), 'WARN');
}
{
  const { state, report } = run('loss of exactly 500 — on the limit', {
    balance: 9_500,
    equity: 9_500,
    dayStartBalance: 10_000,
    dayLowEquity: 9_500,
  });
  check('exact limit → breach', state('DAILY_DRAWDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  const { state, used } = run('loss of 501 — one dollar over', {
    balance: 9_499,
    equity: 9_499,
    dayStartBalance: 10_000,
    dayLowEquity: 9_499,
  });
  check('above limit → breach', state('DAILY_DRAWDOWN'), 'BREACH');
  check('measured from the day-start balance', used('DAILY_DRAWDOWN'), 501);
}
{
  const { state } = run('limit set to zero', {
    balance: 5_000,
    equity: 5_000,
    challenge: { dailyDrawdown: 0 },
  });
  check('zero limit → rule off, not instant breach', state('DAILY_DRAWDOWN'), 'OFF');
}
{
  // The dip is what matters, not where the account finished.
  const { state, used } = run('recovered from a 600 dip', {
    balance: 10_050,
    equity: 10_050,
    dayStartBalance: 10_000,
    dayLowEquity: 9_400,
  });
  check('the low is judged, not the close', state('DAILY_DRAWDOWN'), 'BREACH');
  check('counts the full 600', used('DAILY_DRAWDOWN'), 600);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── overall drawdown: static, from the initial balance ──');
{
  const { state } = run('999 down — inside the 1,000 limit', {
    balance: 9_001,
    equity: 9_001,
    lowestEquity: 9_001,
  });
  check('below limit', state('MAX_DRAWDOWN'), 'WARN');
}
{
  const { state, report } = run('exactly 1,000 down', {
    balance: 9_000,
    equity: 9_000,
    lowestEquity: 9_000,
  });
  check('exact limit → breach', state('MAX_DRAWDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // Profit must not move the floor: this is a static drawdown, not a trailing one.
  const { state, used } = run('grew to 12,000, never dipped', {
    balance: 12_000,
    equity: 12_000,
    lowestEquity: 10_000,
  });
  check('no drawdown from growth', state('MAX_DRAWDOWN'), 'OK');
  check('nothing used', used('MAX_DRAWDOWN'), 0);
}
{
  const { used } = run('grew to 12,000 then fell to 11,200', {
    balance: 11_200,
    equity: 11_200,
    lowestEquity: 11_200,
  });
  check('floor stays at the initial balance', used('MAX_DRAWDOWN'), 0);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── floating risk: any open position ──');
// Limit is 2.5% of 10,000 = 250.
{
  const { state, used, detail } = run('one position 400 down', {
    balance: 10_000,
    equity: 9_600,
    openPositions: 1,
    trades: [{ symbol: 'XAUUSD', profit: -400, openedAt: hoursAgo(1), closedAt: null }],
  });
  // The published rule binds "the combined loss of open trades at any moment"
  // with no minimum count, so one position past the allowance breaches. The
  // two-position reading was an error in the engine, not in the rules.
  check('a single position does breach', state('FLOATING_RISK'), 'BREACH');
  check('its loss is counted in full', used('FLOATING_RISK'), 400);
  check('reports the open count', detail('FLOATING_RISK'), 'open:1');
}
{
  const { state, report } = run('two positions 260 down combined', {
    balance: 10_000,
    equity: 9_740,
    openPositions: 2,
    trades: [
      { symbol: 'XAUUSD', profit: -130, openedAt: hoursAgo(1), closedAt: null },
      { symbol: 'XAUUSD', profit: -130, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('combined loss breaches', state('FLOATING_RISK'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  const { state } = run('two positions exactly 250 down', {
    balance: 10_000,
    equity: 9_750,
    openPositions: 2,
    trades: [
      { symbol: 'XAUUSD', profit: -125, openedAt: hoursAgo(1), closedAt: null },
      { symbol: 'XAUUSD', profit: -125, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('exact limit → breach', state('FLOATING_RISK'), 'BREACH');
}
{
  const { state } = run('two positions 150 down', {
    balance: 10_000,
    equity: 9_850,
    openPositions: 2,
    trades: [
      { symbol: 'XAUUSD', profit: -75, openedAt: hoursAgo(1), closedAt: null },
      { symbol: 'XAUUSD', profit: -75, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('inside the limit', state('FLOATING_RISK'), 'OK');
}
{
  // The reported bug: a flat account showing a floating figure it cannot have.
  const { state, used, detail } = run('flat account, no positions open', {
    balance: 999.38,
    equity: 999.38,
    startingBalance: 1_000,
    openPositions: 0,
    worstFloating: 0, worstFloatingPct: null,
  });
  check('nothing floating', used('FLOATING_RISK'), 0);
  check('within limit', state('FLOATING_RISK'), 'OK');
  check('open count reported as zero', detail('FLOATING_RISK'), 'open:0');
}
{
  // A breach that already happened stays a breach after the positions close.
  const { state, detail } = run('recorded 300 while two ran, now flat', {
    balance: 10_000,
    equity: 10_000,
    openPositions: 0,
    worstFloating: 300, worstFloatingPct: null,
  });
  check('sticky breach survives the close', state('FLOATING_RISK'), 'BREACH');
  check('marked as historic, not live', detail('FLOATING_RISK'), 'peak:0');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── cooldown after a losing trade (5 minutes) ──');
{
  const loss = { symbol: 'XAUUSD', profit: -50, openedAt: minsAgo(40), closedAt: minsAgo(30) };
  const { state, report } = run('re-entered 3 minutes after a loss', {
    trades: [loss, trade({ openedAt: minsAgo(27), closedAt: minsAgo(10), profit: 10 })],
  });
  // Propyar: any losing trade starts the five-minute clock. It is a warning,
  // so re-entering early is flagged but the account keeps running.
  check('any loss starts the cooldown', state('HFT_COOLDOWN'), 'WARN');
  check('account stays active', report.status, 'ACTIVE');
}
{
  const loss = { symbol: 'XAUUSD', profit: -50, openedAt: minsAgo(40), closedAt: minsAgo(30) };
  const { state } = run('re-entered exactly 5 minutes after a loss', {
    trades: [loss, trade({ openedAt: minsAgo(25), closedAt: minsAgo(10), profit: 10 })],
  });
  check('exactly the window → allowed', state('HFT_COOLDOWN'), 'OK');
}
{
  const loss = { symbol: 'XAUUSD', profit: -50, openedAt: minsAgo(40), closedAt: minsAgo(30) };
  const { state } = run('re-entered 6 minutes after a loss', {
    trades: [loss, trade({ openedAt: minsAgo(24), closedAt: minsAgo(10), profit: 10 })],
  });
  check('outside the window → fine', state('HFT_COOLDOWN'), 'OK');
}
{
  // Hedged legs opened together: the second was not opened *in reaction* to the
  // first one's loss, so it must not be punished for it.
  const opened = minsAgo(40);
  const { state } = run('two legs opened together, one closes at a loss first', {
    trades: [
      { symbol: 'XAUUSD', profit: -50, openedAt: opened, closedAt: minsAgo(30) },
      { symbol: 'XAUUSD', profit: 60, openedAt: opened, closedAt: minsAgo(20) },
    ],
  });
  check('a position already open is not a re-entry', state('HFT_COOLDOWN'), 'OK');
}
{
  // The production bug: imported history from before the account was issued.
  const { state, report } = run('history predates the account', {
    openedAt: minsAgo(5),
    trades: [
      { symbol: 'XAUUSD', profit: -50, openedAt: daysAgo(7), closedAt: daysAgo(7) },
      trade({ openedAt: new Date(daysAgo(7).getTime() + 60_000), profit: 10 }),
    ],
  });
  check('old trades are not the trader’s conduct here', state('HFT_COOLDOWN'), 'OK');
  check('account not failed', report.status, 'ACTIVE');
}
{
  const { state } = run('cooldown switched off', {
    settings: { hftCooldownMinutes: 0 },
    trades: [
      { symbol: 'XAUUSD', profit: -50, openedAt: minsAgo(40), closedAt: minsAgo(30) },
      trade({ openedAt: minsAgo(29), profit: 10 }),
    ],
  });
  check('zero minutes → rule off', state('HFT_COOLDOWN'), 'OFF');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── minimum holding time ──');
{
  const opened = hoursAgo(2);
  const { report } = run('30-second winner is voided', {
    balance: 10_100,
    trades: [{ symbol: 'XAUUSD', profit: 100, openedAt: opened, closedAt: new Date(opened.getTime() + 30_000) }],
  });
  check('profit does not count', report.voidedProfit, 100);
}
{
  const opened = hoursAgo(2);
  const { report } = run('61-second winner counts', {
    balance: 10_100,
    trades: [{ symbol: 'XAUUSD', profit: 100, openedAt: opened, closedAt: new Date(opened.getTime() + 61_000) }],
  });
  check('nothing voided', report.voidedProfit, 0);
}
{
  const opened = hoursAgo(2);
  const { report } = run('exactly 60 seconds', {
    balance: 10_100,
    trades: [{ symbol: 'XAUUSD', profit: 100, openedAt: opened, closedAt: new Date(opened.getTime() + 60_000) }],
  });
  check('on the boundary the trade counts', report.voidedProfit, 0);
}
{
  const opened = hoursAgo(2);
  const { report } = run('30-second loser is kept in full', {
    balance: 9_900,
    trades: [{ symbol: 'XAUUSD', profit: -100, openedAt: opened, closedAt: new Date(opened.getTime() + 30_000) }],
  });
  check('the trader keeps the damage', report.voidedProfit, 0);
}
{
  const opened = hoursAgo(2);
  const { state, report } = run('a sub-minute trade disables the account', {
    balance: 10_100,
    trades: [{ symbol: 'XAUUSD', profit: 100, openedAt: opened, closedAt: new Date(opened.getTime() + 5_000) }],
  });
  check('is a breach', state('MIN_HOLD_TIME'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── minimum trading days ──');
{
  const day = daysAgo(1);
  const { used } = run('ten trades in one day', {
    trades: Array.from({ length: 10 }, (_, i) =>
      trade({ openedAt: new Date(day.getTime() + i * 60_000), profit: 1 }),
    ),
  });
  check('counts as one day', used('MIN_TRADING_DAYS'), 1);
}
{
  const { used, state } = run('five separate days', { trades: fiveGoodDays(10) });
  check('five days counted', used('MIN_TRADING_DAYS'), 5);
  check('objective met', state('MIN_TRADING_DAYS'), 'MET');
}
{
  // Counted from the open, so an overnight hold does not earn a second day.
  const opened = daysAgo(2);
  const { used } = run('opened one day, closed the next', {
    trades: [trade({ openedAt: opened, closedAt: new Date(opened.getTime() + 86_400_000), profit: 5 })],
  });
  check('one day, not two', used('MIN_TRADING_DAYS'), 1);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── instrument restriction ──');
{
  const { state } = run('gold only', { trades: [trade({ symbol: 'XAUUSD', profit: 5 })] });
  check('allowed symbol', state('INSTRUMENT'), 'OK');
}
{
  const { state, detail } = run('traded EURUSD', {
    trades: [trade({ symbol: 'EURUSD', profit: 5 })],
  });
  check('offending symbol → breach', state('INSTRUMENT'), 'BREACH');
  check('names the symbol', detail('INSTRUMENT'), 'EURUSD');
}
{
  const { state } = run('broker suffix on the allowed symbol', {
    trades: [trade({ symbol: 'XAUUSD.m', profit: 5 })],
  });
  check('suffix still allowed', state('INSTRUMENT'), 'OK');
}
{
  const { state } = run('empty allow-list', {
    settings: { allowedSymbols: [] },
    trades: [trade({ symbol: 'BTCUSD', profit: 5 })],
  });
  check('no list → everything permitted', state('INSTRUMENT'), 'OFF');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── profit target ──');
{
  const { state, report } = run('target reached, all flat', {
    balance: 11_000,
    equity: 11_000,
    trades: fiveGoodDays(200),
  });
  check('target met', state('PROFIT_TARGET'), 'MET');
  check('stage passed', report.status, 'PASSED');
}
{
  const { state, detail, report } = run('target reached but a position is open', {
    balance: 11_000,
    equity: 11_000,
    openPositions: 1,
    trades: [...fiveGoodDays(200), { symbol: 'XAUUSD', profit: 0, openedAt: hoursAgo(1), closedAt: null }],
  });
  check('not met while holding', state('PROFIT_TARGET'), 'OK');
  check('explains why', detail('PROFIT_TARGET'), 'open');
  check('stage not passed', report.status, 'ACTIVE');
}
{
  const { report } = run('target met but only three trading days', {
    balance: 11_000,
    equity: 11_000,
    trades: [1, 2, 3].map((d) =>
      trade({ openedAt: daysAgo(d), closedAt: new Date(daysAgo(d).getTime() + 5_400_000), profit: 340 }),
    ),
  });
  check('minimum days still blocks the pass', report.status, 'ACTIVE');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── consistency ──');
{
  // 5 days at 200 each: best day is 20% of the total.
  const { state } = run('evenly spread profit', {
    balance: 11_000,
    equity: 11_000,
    trades: fiveGoodDays(200),
  });
  check('well inside the cap', state('CONSISTENCY'), 'OK');
}
{
  // One day carries 60% of a 1,000 profit, but the target is not reached yet.
  const { state, report } = run('concentrated, target not yet reached', {
    balance: 10_900,
    equity: 10_900,
    trades: [
      ...fiveGoodDays(80),
      trade({ openedAt: daysAgo(6), closedAt: new Date(daysAgo(6).getTime() + 5_400_000), profit: 500 }),
    ],
  });
  // Exactly on the cap is not over it: the rule reads "no more than 50%", so
  // a day worth precisely half the target leaves the target where it is.
  check('exactly at the cap does not move the target', state('CONSISTENCY'), 'OK');
  check('account still active', report.status, 'ACTIVE');
}
{
  // Same concentration, but now the target is met — this is the finish line.
  const { state, report } = run('concentrated at the finish line', {
    balance: 11_000,
    equity: 11_000,
    trades: [
      ...fiveGoodDays(100),
      trade({ openedAt: daysAgo(6), closedAt: new Date(daysAgo(6).getTime() + 5_400_000), profit: 500 }),
    ],
  });
  // Consistency never fails an account -- it moves the finish line instead.
  check('never breaches', state('CONSISTENCY') === 'BREACH', false);
  check('the account is not failed by it', report.status === 'FAILED', false);
}
{
  const { state } = run('consistency switched off', {
    balance: 11_000,
    equity: 11_000,
    settings: { consistencyRulePercent: 0 },
    trades: fiveGoodDays(200),
  });
  check('zero percent → rule off', state('CONSISTENCY'), 'OFF');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── percentages and division safety ──');
{
  const { report } = run('breach at double the limit', {
    balance: 9_000,
    equity: 9_000,
    dayStartBalance: 10_000,
    dayLowEquity: 9_000,
  });
  const daily = report.rules.find((r) => r.key === 'DAILY_DRAWDOWN');
  check('percentage is not capped at 100', daily?.usedPct, 200);
}
{
  const { report } = run('zero starting balance', {
    startingBalance: 0,
    balance: 0,
    equity: 0,
  });
  check('no NaN in the profit percentage', Number.isFinite(report.profitPct), true);
  check(
    'no NaN in any gauge',
    report.rules.every((r) => Number.isFinite(r.usedPct)),
    true,
  );
}

// ═══════════════════════════════════════════════════════════
console.log('\n── watermarks ──');
{
  // A balance dip that happened and recovered between two pushes.
  //
  // Balance only moves on a close, but two closes inside one push window -- a
  // loser then a winner -- take it under the line and back above it. Reading
  // only at push time misses the breach completely, which is the same hole the
  // floating rule had.
  const key = dayKey(new Date(), 0);
  const before = {
    dayStartBalance: 10_000,
    dayLowKey: key,
    dayLowEquity: 10_000,
    lowestEquity: 10_000,
    dayLowBalance: 10_000,
    lowestBalance: 10_000,
    worstFloating: null,
    worstFloatingPct: null,
  };
  const dipped = nextWatermarks(
    before,
    { balance: 9_700, equity: 9_700, balanceLow: 9_400, openCount: 0 },
    0,
  );
  check('a balance dip between pushes is recorded', dipped.dayLowBalance, 9_400);
  check('and kept as the lowest ever', dipped.lowestBalance, 9_400);

  // Without the sample, only the push-time figure would land.
  const unsampled = nextWatermarks(
    before,
    { balance: 9_700, equity: 9_700, openCount: 0 },
    0,
  );
  check('without sampling only the push value lands', unsampled.dayLowBalance, 9_700);
}
{
  // A terminal that has not finished connecting reports zeros. Recorded as a
  // real reading it becomes a permanent equity floor of zero, and every
  // drawdown afterwards is measured against it -- which failed a healthy
  // account at 2006% of its daily limit on the first push after a restart.
  const notReadyBefore = {
    dayStartBalance: 10_000,
    dayLowKey: dayKey(new Date(), 0),
    dayLowEquity: 9_800,
    lowestEquity: 9_700,
    dayLowBalance: null,
    lowestBalance: null,
    worstFloating: 120,
    worstFloatingPct: null,
  };
  const notReadyAfter = nextWatermarks(notReadyBefore, { balance: 0, equity: 0, openCount: 0 }, 0);
  check('an unconnected terminal does not move the daily low', notReadyAfter.dayLowEquity, 9_800);
  check('nor the lowest equity ever', notReadyAfter.lowestEquity, 9_700);
  check('nor the day reference', notReadyAfter.dayStartBalance, 10_000);
  check('nor the floating mark', notReadyAfter.worstFloating, 120);

  // A genuinely wiped account still reports a real balance, so it must land.
  const wiped = nextWatermarks(notReadyBefore, { balance: 9_700, equity: 0.5, openCount: 0 }, 0);
  check('a real near-zero equity is still recorded', wiped.lowestEquity, 0.5);
}
{
  const marks = nextWatermarks(
    { dayStartBalance: 10_000, dayLowKey: null, dayLowEquity: null, lowestEquity: null, dayLowBalance: null, lowestBalance: null, worstFloatingPct: null, worstFloating: null },
    { balance: 3_900, equity: 3_900, openCount: 0 },
    0,
  );
  // The clamp that used to live here rewrote the day's reference to the current
  // balance, reporting a 61% daily loss as zero.
  check('a catastrophic day is not clamped away', marks.dayLowEquity, 3_900);
}
{
  const today = new Date();
  const key = new Date(today.getTime()).toISOString().slice(0, 10);
  const marks = nextWatermarks(
    { dayStartBalance: 10_000, dayLowKey: key, dayLowEquity: 9_800, lowestEquity: 9_800, dayLowBalance: null, lowestBalance: null, worstFloatingPct: null, worstFloating: null },
    { balance: 10_000, equity: -50, openCount: 1 },
    0,
  );
  check('negative equity survives', marks.dayLowEquity, -50);
  check('a single position does raise the floating mark', marks.worstFloating, 10_050);
}
{
  const today = new Date().toISOString().slice(0, 10);
  const marks = nextWatermarks(
    { dayStartBalance: 10_000, dayLowKey: today, dayLowEquity: 10_000, lowestEquity: 10_000, dayLowBalance: null, lowestBalance: null, worstFloatingPct: null, worstFloating: null },
    { balance: 10_000, equity: 9_700, openCount: 2 },
    0,
  );
  check('two positions do raise it', marks.worstFloating, 300);
}
{
  const today = new Date().toISOString().slice(0, 10);
  const marks = nextWatermarks(
    { dayStartBalance: 10_000, dayLowKey: today, dayLowEquity: 10_000, lowestEquity: 10_000, dayLowBalance: null, lowestBalance: null, worstFloatingPct: null, worstFloating: null },
    { balance: 10_000, equity: 10_000, openCount: 0, floatingWorst: 400, openCountPeak: 3 },
    0,
  );
  check('a sampled burst of three counts', marks.worstFloating, 400);
}
{
  const today = new Date().toISOString().slice(0, 10);
  const marks = nextWatermarks(
    { dayStartBalance: 10_000, dayLowKey: today, dayLowEquity: 10_000, lowestEquity: 10_000, dayLowBalance: null, lowestBalance: null, worstFloatingPct: null, worstFloating: null },
    { balance: 10_000, equity: 10_000, openCount: 0, floatingWorst: 400, openCountPeak: 1 },
    0,
  );
  check('a sampled single position counts too', marks.worstFloating, 400);
}

// ═══════════════════════════════════════════════════════════
// The trading day starts at the BROKER's midnight, not UTC's.
//
// This was one number typed into the admin panel for the whole platform, and it
// sat at 0 (UTC) while the brokers ran on UTC+2/+3. Every daily rule was
// therefore measured over the wrong 24 hours. The terminal now reports its own
// server clock and each account is judged on that.
// ═══════════════════════════════════════════════════════════
{
  const late = new Date('2026-03-01T22:30:00Z');
  check('22:30 UTC is still the 1st on a UTC broker', dayKey(late, 0), '2026-03-01');
  check('but already the 2nd on UTC+3', dayKey(late, 3), '2026-03-02');
  check('and still the 1st on UTC-5', dayKey(late, -5), '2026-03-01');
  // Half-hour offsets are real: Iran is +3:30, India +5:30.
  check('half-hour offsets are honoured', dayKey(late, 3.5), '2026-03-02');
}
{
  // Same loss, same account, two broker clocks — one breaches, one does not.
  // Offsets are derived from the clock at run time so the boundary genuinely
  // falls between the trade and now, whenever the suite happens to run.
  const legal = (h: number) => {
    while (h < -12) h += 24;
    while (h > 14) h -= 24;
    return h;
  };
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const justPastMidnight = legal((30 - utcMin) / 60); // broker local ~00:30
  const sameDay = legal(justPastMidnight + 3); // broker local ~03:30
  const closedAt = hoursAgo(2);
  const trades: MonitorTrade[] = [
    { symbol: 'XAUUSD', profit: -60, openedAt: hoursAgo(3), closedAt },
  ];
  const daily = (offset: number) =>
    buildReport(
      {
        startingBalance: 1000,
        balance: 940,
        equity: 940,
        phase: 'PHASE_1',
        status: 'ACTIVE',
        openPositions: 0,
        openedAt: ISSUED,
      },
      CHALLENGE,
      trades,
      { ...SETTINGS, dayResetUtcOffset: offset },
      'test',
    ).rules.find((r) => r.key === 'DAILY_DRAWDOWN')!;

  const yesterday = daily(justPastMidnight);
  const today = daily(sameDay);
  check('a loss before the broker rollover is not today’s', yesterday.used, 0);
  check('the same loss after it is', Math.round(today.used), 60);
  check('and it breaches the daily limit', today.state, 'BREACH');
  check('so the two clocks disagree', yesterday.state === today.state, false);
}

// ═══════════════════════════════════════════════════════════
console.log(
  failed === 0
    ? `\n✅ all ${passed} monitor checks passed.\n`
    : `\n${failed} monitor check(s) FAILED (${passed} passed).\n`,
);
process.exitCode = failed === 0 ? 0 : 1;
