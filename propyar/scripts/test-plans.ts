// Per-plan suite: one-step, two-step and Direct Real, each walked through
// its own stages with the figures from the Propyar plan sheet.
//   npm run test:plans
//
// The generic boundaries of every rule live in test-monitor.ts and the worked
// examples of the rules page in test-rules-spec.ts. This file answers the
// question the client tests by hand: does each challenge behave as sold?
import {
  buildReport,
  MONITOR_DEFAULTS,
  type AccountSnapshot,
  type MonitorChallenge,
  type MonitorTrade,
} from '../src/lib/monitor';
import { evaluatePayout } from '../src/lib/payout-math';
import {
  initialPhase,
  nextPhase,
  splitForPayout,
  nextPayoutDate,
} from '../src/lib/plan-rules';

const SETTINGS = { ...MONITOR_DEFAULTS };
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const ISSUED = daysAgo(90);

// The $5,000 rows from the plan sheet.
const ONE_STEP: MonitorChallenge = {
  accountType: 'ONE_STEP',
  profitTarget: 8, profitTargetP2: 0, dailyDrawdown: 3, maxDrawdown: 6,
  floatingRisk: 2, minTradingDays: 5,
};
const TWO_STEP: MonitorChallenge = {
  accountType: 'TWO_STEP',
  profitTarget: 10, profitTargetP2: 5, dailyDrawdown: 5, maxDrawdown: 12,
  floatingRisk: 2, minTradingDays: 5,
};
const DIRECT_REAL: MonitorChallenge = {
  accountType: 'INSTANT',
  profitTarget: 5, profitTargetP2: 0, dailyDrawdown: 0, maxDrawdown: 5,
  floatingRisk: 2, minTradingDays: 10,
};

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.log(`✗ ${label}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** One winning round trip per day, each held 90 minutes. */
function days(n: number, profitEach: number, startDaysAgo = n + 1): MonitorTrade[] {
  return Array.from({ length: n }, (_, i) => {
    const openedAt = new Date(daysAgo(startDaysAgo - i).getTime());
    return {
      symbol: 'XAUUSD',
      profit: profitEach,
      openedAt,
      closedAt: new Date(openedAt.getTime() + 90 * 60_000),
    };
  });
}

function run(
  challenge: MonitorChallenge,
  phase: string,
  over: Partial<AccountSnapshot> & { trades?: MonitorTrade[] } = {},
) {
  const { trades = [], ...acct } = over;
  const start = acct.startingBalance ?? 5_000;
  const balance = acct.balance ?? start + trades.reduce((s, t) => s + t.profit, 0);
  const report = buildReport(
    {
      startingBalance: start,
      balance,
      equity: acct.equity ?? balance,
      phase,
      status: phase === 'FUNDED' ? 'FUNDED' : 'ACTIVE',
      openedAt: ISSUED,
      openPositions: 0,
      dayStartBalance: balance,
      ...acct,
    },
    challenge,
    trades,
    SETTINGS,
    'test',
  );
  const rule = (k: string) => report.rules.find((r) => r.key === k)!;
  return { report, rule };
}

// ═══════════════════════════════════════════════════════════
console.log('\n── stage order per plan ──');
check('one-step starts in stage 1', initialPhase('ONE_STEP'), 'PHASE_1');
check('one-step stage 1 → main account', nextPhase('ONE_STEP', 'PHASE_1'), 'FUNDED');
check('two-step starts in stage 1', initialPhase('TWO_STEP'), 'PHASE_1');
check('two-step stage 1 → stage 2', nextPhase('TWO_STEP', 'PHASE_1'), 'PHASE_2');
check('two-step stage 2 → main account', nextPhase('TWO_STEP', 'PHASE_2'), 'FUNDED');
check('Direct Real starts on the main account', initialPhase('INSTANT'), 'FUNDED');
check('Direct Real has no next stage', nextPhase('INSTANT', 'FUNDED'), null);
check('a main account has no next stage', nextPhase('ONE_STEP', 'FUNDED'), null);

// ═══════════════════════════════════════════════════════════
console.log('\n── one-step $5,000: 8% target, 3% daily, 6% max ──');
{
  const { report, rule } = run(ONE_STEP, 'PHASE_1', { trades: days(5, 80) });
  check('target is 8% = $400', rule('PROFIT_TARGET').limit, 400);
  check('$400 over five days passes', report.status, 'PASSED');
}
{
  const { report } = run(ONE_STEP, 'PHASE_1', { trades: days(4, 100) });
  check('target met in four days is not enough', report.status, 'ACTIVE');
}
{
  const { rule, report } = run(ONE_STEP, 'PHASE_1', {
    balance: 5_000, dayStartBalance: 5_000, equity: 4_849,
    openPositions: 1, worstFloatingPct: 0,
  });
  check('daily allowance is 3% of the day = $150', rule('DAILY_DRAWDOWN').limit, 150);
  check('$151 under the day fails', report.status, 'FAILED');
}
{
  const { rule, report } = run(ONE_STEP, 'PHASE_1', { balance: 4_700, lowestBalance: 4_700, dayStartBalance: 4_800 });
  check('max allowance is 6% = $300', rule('MAX_DRAWDOWN').limit, 300);
  check('exactly $300 down fails', report.status, 'FAILED');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── two-step $5,000: 10% then 5%, 5% daily, 12% max ──');
{
  const { rule, report } = run(TWO_STEP, 'PHASE_1', { trades: days(5, 100) });
  check('stage 1 target is $500', rule('PROFIT_TARGET').limit, 500);
  check('stage 1 passes at $500 in five days', report.status, 'PASSED');
}
{
  const { rule, report } = run(TWO_STEP, 'PHASE_2', { trades: days(5, 50) });
  check('stage 2 target is $250', rule('PROFIT_TARGET').limit, 250);
  check('stage 2 passes at $250 in five days', report.status, 'PASSED');
}
{
  const { rule } = run(TWO_STEP, 'PHASE_1', { balance: 4_500, lowestBalance: 4_500, dayStartBalance: 4_600 });
  check('max allowance is 12% = $600', rule('MAX_DRAWDOWN').limit, 600);
  check('$500 down is still inside it', rule('MAX_DRAWDOWN').state, 'WARN');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── Direct Real $5,000: no daily limit, 5% max ──');
{
  const { rule, report } = run(DIRECT_REAL, 'FUNDED', {
    balance: 4_800, lowestBalance: 4_800, dayStartBalance: 5_000,
  });
  check('daily drawdown is switched off', rule('DAILY_DRAWDOWN').state, 'OFF');
  check('a $200 day does not fail it', report.status, 'FUNDED');
}
{
  const { rule, report } = run(DIRECT_REAL, 'FUNDED', { balance: 4_750, lowestBalance: 4_750, dayStartBalance: 4_800 });
  check('max allowance is 5% = $250', rule('MAX_DRAWDOWN').limit, 250);
  check('$250 down fails it', report.status, 'FAILED');
}
{
  const { rule } = run(DIRECT_REAL, 'FUNDED', { trades: days(10, 25) });
  check('payout objective is 5% = $250', rule('PROFIT_TARGET').limit, 250);
  check('reached after 10 days', rule('PROFIT_TARGET').state, 'MET');
  check('needs 10 trading days', rule('MIN_TRADING_DAYS').limit, 10);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── rules shared by every plan ──');
for (const [name, ch, phase] of [
  ['one-step', ONE_STEP, 'PHASE_1'],
  ['two-step', TWO_STEP, 'PHASE_1'],
  ['Direct Real', DIRECT_REAL, 'FUNDED'],
] as const) {
  {
    // Floating risk: 2% of live equity, from the first position.
    const { rule, report } = run(ch, phase, {
      balance: 5_000, equity: 4_895, dayStartBalance: 5_000, openPositions: 1,
    });
    check(`${name}: floating $105 on one position breaches 2%`, rule('FLOATING_RISK').state, 'BREACH');
    check(`${name}: and fails the account`, report.status, 'FAILED');
  }
  {
    const opened = daysAgo(2);
    const { rule, report } = run(ch, phase, {
      trades: [{ symbol: 'XAUUSD', profit: -5, openedAt: opened, closedAt: new Date(opened.getTime() + 40_000) }],
    });
    check(`${name}: a 40-second trade is a breach`, rule('MIN_HOLD_TIME').state, 'BREACH');
    check(`${name}: and disables the account`, report.status, 'FAILED');
  }
  {
    const t0 = daysAgo(2);
    const { rule, report } = run(ch, phase, {
      trades: [
        { symbol: 'XAUUSD', profit: -20, openedAt: t0, closedAt: new Date(t0.getTime() + 10 * 60_000) },
        { symbol: 'XAUUSD', profit: 5, openedAt: new Date(t0.getTime() + 12 * 60_000), closedAt: new Date(t0.getTime() + 40 * 60_000) },
      ],
    });
    check(`${name}: re-entry 2 min after a loss is an HFT warning`, rule('HFT_COOLDOWN').state, 'WARN');
    check(`${name}: which does not fail the account`, report.status === 'FAILED', false);
  }
  {
    const { rule } = run(ch, phase, {
      trades: [{ symbol: 'EURUSD', profit: 10, openedAt: daysAgo(2), closedAt: new Date(daysAgo(2).getTime() + 3_600_000) }],
    });
    check(`${name}: only gold is allowed`, rule('INSTRUMENT').state, 'BREACH');
  }
}

// ═══════════════════════════════════════════════════════════
console.log('\n── payouts: target, days, tiered split, refund ──');
function payout(type: string, over: Partial<Parameters<typeof evaluatePayout>[0]> = {}) {
  return evaluatePayout({
    status: 'FUNDED', balance: 5_600, equity: 5_600, startingBalance: 5_000,
    profitSplit: 80, fundedAt: daysAgo(40), kycStatus: 'APPROVED',
    hasPendingRequest: false, openPositions: 0,
    accountType: type, paidCount: 0, tradingDays: 20, challengeFee: 55,
    ...over,
  });
}
check('one-step: 1st payout share is 60%', payout('ONE_STEP').splitPercent, 60);
check('one-step: 2nd payout share is 70%', payout('ONE_STEP', { paidCount: 1 }).splitPercent, 70);
check('one-step: 3rd payout share is 80%', payout('ONE_STEP', { paidCount: 2 }).splitPercent, 80);
check('one-step: 5th payout stays at 80%', payout('ONE_STEP', { paidCount: 4 }).splitPercent, 80);
check('one-step: $600 profit at 60% = $360', payout('ONE_STEP').available, 360);
check('one-step: fee refunded with the 3rd payout', payout('ONE_STEP', { paidCount: 2 }).refundAmount, 55);
check('one-step: not with the 2nd', payout('ONE_STEP', { paidCount: 1 }).refundAmount, 0);
check('one-step: needs 15 trading days', payout('ONE_STEP', { tradingDays: 14 }).block, 'MIN_TRADING_DAYS');
check('one-step: needs 10% profit', payout('ONE_STEP', { balance: 5_400, equity: 5_400 }).block, 'TARGET_NOT_MET');
check('one-step: eligible at 10% and 15 days', payout('ONE_STEP', { tradingDays: 15 }).eligible, true);
check('two-step: 10 trading days are enough', payout('TWO_STEP', { tradingDays: 10 }).eligible, true);
check('two-step: 9 are not', payout('TWO_STEP', { tradingDays: 9 }).block, 'MIN_TRADING_DAYS');
check('Direct Real: 1st share is 50%', payout('INSTANT').splitPercent, 50);
check('Direct Real: 3rd share is 70%', payout('INSTANT', { paidCount: 2 }).splitPercent, 70);
check('Direct Real: 5% profit is enough', payout('INSTANT', { balance: 5_250, equity: 5_250, tradingDays: 10 }).eligible, true);
check('Direct Real: no fee refund', payout('INSTANT', { paidCount: 2 }).refundAmount, 0);
check('split helper agrees', splitForPayout('TWO_STEP', 0), 60);

const next = nextPayoutDate(new Date(Date.UTC(2026, 10, 15)));
check('after the 14th the next run is the 28th', next.getUTCDate(), 28);
const wrap = nextPayoutDate(new Date(Date.UTC(2026, 10, 29)));
check('after the 28th it rolls to the 14th of next month', `${wrap.getUTCMonth()}-${wrap.getUTCDate()}`, '11-14');

console.log(
  failed
    ? `\n❌ ${failed} plan check(s) FAILED (${passed} passed).`
    : `\n✅ all ${passed} plan checks passed.`,
);
process.exit(failed ? 1 : 0);
