// Exercises the rule engine against the edge cases that previously misfired.
//   npx tsx scripts/test-monitor.ts
import {
  buildReport,
  MONITOR_DEFAULTS,
  type MonitorChallenge,
  type MonitorSettings,
  type MonitorTrade,
} from '../src/lib/monitor';

const CHALLENGE: MonitorChallenge = {
  profitTarget: 10,
  profitTargetP2: 5,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  floatingRisk: 2.5,
  minTradingDays: 5,
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

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

/** Five separate trading days so the minimum-days objective is satisfied. */
function fiveGoodDays(profitEach: number): MonitorTrade[] {
  return [1, 2, 3, 4, 5].map((d) =>
    trade({ openedAt: daysAgo(d), closedAt: new Date(daysAgo(d).getTime() + 5_400_000), profit: profitEach }),
  );
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? '✓' : '✗'} ${name}` + (ok ? '' : `\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

function run(
  label: string,
  opts: {
    balance: number;
    equity: number;
    trades: MonitorTrade[];
    settings?: Partial<MonitorSettings>;
    challenge?: Partial<MonitorChallenge>;
    phase?: string;
    dayLowEquity?: number;
    lowestEquity?: number;
    worstFloating?: number;
    dayStartBalance?: number;
  },
) {
  const report = buildReport(
    {
      startingBalance: 10_000,
      balance: opts.balance,
      equity: opts.equity,
      dayLowEquity: opts.dayLowEquity,
      lowestEquity: opts.lowestEquity,
      worstFloating: opts.worstFloating,
      dayStartBalance: opts.dayStartBalance,
      phase: opts.phase ?? 'PHASE_1',
      status: 'ACTIVE',
    },
    { ...CHALLENGE, ...opts.challenge },
    opts.trades,
    { ...MONITOR_DEFAULTS, ...opts.settings },
    'test',
  );
  const state = (key: string) =>
    report.rules.find((r) => r.key === key)?.state ?? 'MISSING';
  return { label, report, state };
}

console.log('\n── limits of zero must mean "not enforced" ──');
{
  const { report, state } = run('zero limits', {
    balance: 10_000,
    equity: 10_000,
    trades: [],
    challenge: { dailyDrawdown: 0, maxDrawdown: 0, floatingRisk: 0 },
  });
  check('daily drawdown → OFF', state('DAILY_DRAWDOWN'), 'OFF');
  check('max drawdown → OFF', state('MAX_DRAWDOWN'), 'OFF');
  check('floating risk → OFF', state('FLOATING_RISK'), 'OFF');
  check('account not failed', report.status, 'ACTIVE');
  check('no breaches', report.breaches, []);
}

console.log('\n── an empty symbol list allows everything ──');
{
  const { report, state } = run('no symbol list', {
    balance: 10_000,
    equity: 10_000,
    trades: [trade({ symbol: 'EURUSD' })],
    settings: { allowedSymbols: [] },
  });
  check('instrument → OFF', state('INSTRUMENT'), 'OFF');
  check('account not failed', report.status, 'ACTIVE');
}

console.log('\n── a sub-minute trade must not block passing ──');
{
  const trades = [
    ...fiveGoodDays(250),
    // 30-second winner: its profit is voided, but it is not a breach.
    trade({ openedAt: hoursAgo(3), closedAt: new Date(hoursAgo(3).getTime() + 30_000), profit: 50 }),
  ];
  const { report, state } = run('short trade', {
    balance: 11_300,
    equity: 11_300,
    trades,
  });
  check('min hold flagged', state('MIN_HOLD_TIME'), 'WARN');
  check('short-trade profit voided', report.voidedProfit, 50);
  check('still passes', report.status, 'PASSED');
}

console.log('\n── real breaches still fire ──');
{
  // Loss realised on an earlier day, so only the overall limit is in play.
  const old = daysAgo(3);
  const { report, state } = run('max drawdown hit', {
    balance: 8_900,
    equity: 8_900,
    trades: [
      trade({ openedAt: old, closedAt: new Date(old.getTime() + 5_400_000), profit: -1100 }),
    ],
  });
  check('max drawdown → BREACH', state('MAX_DRAWDOWN'), 'BREACH');
  check('daily untouched today', state('DAILY_DRAWDOWN'), 'OK');
  check('account failed', report.status, 'FAILED');
  check('breach recorded', report.breaches, ['MAX_DRAWDOWN']);
}
{
  // Lost 600 today against a 500 daily allowance, but only 6% overall.
  const today = hoursAgo(2);
  const { report, state } = run('daily drawdown hit', {
    balance: 9_400,
    equity: 9_400,
    trades: [
      trade({ openedAt: today, closedAt: new Date(today.getTime() + 3_600_000), profit: -600 }),
    ],
  });
  check('daily → BREACH', state('DAILY_DRAWDOWN'), 'BREACH');
  // 600 of a 1000 overall allowance is 60% — below the 80% warning threshold.
  check('overall still fine', state('MAX_DRAWDOWN'), 'OK');
  check('breach recorded', report.breaches, ['DAILY_DRAWDOWN']);
}
{
  const { report, state } = run('forbidden symbol', {
    balance: 10_000,
    equity: 10_000,
    trades: [trade({ symbol: 'EURUSD' })],
  });
  check('instrument → BREACH', state('INSTRUMENT'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  const loss = trade({ openedAt: hoursAgo(6), closedAt: hoursAgo(5), profit: -200 });
  const tooSoon = trade({ openedAt: new Date(hoursAgo(5).getTime() + 60_000) });
  const { report, state } = run('cooldown broken', {
    balance: 10_000,
    equity: 10_000,
    trades: [loss, tooSoon],
  });
  check('cooldown → BREACH', state('HFT_COOLDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // Same pair of trades, but the cooldown rule is switched off.
  const loss = trade({ openedAt: hoursAgo(6), closedAt: hoursAgo(5), profit: -200 });
  const tooSoon = trade({ openedAt: new Date(hoursAgo(5).getTime() + 60_000) });
  const { report, state } = run('cooldown disabled', {
    balance: 10_000,
    equity: 10_000,
    trades: [loss, tooSoon],
    settings: { hftCooldownMinutes: 0 },
  });
  check('cooldown → OFF', state('HFT_COOLDOWN'), 'OFF');
  check('account survives', report.status, 'ACTIVE');
}

console.log('\n── floating risk uses open positions only ──');
{
  // Two positions, 300 unrealised loss against a 250 limit.
  const { state } = run('floating loss', {
    balance: 10_000,
    equity: 9_700,
    trades: [
      trade({ closedAt: null, profit: -150 }),
      trade({ closedAt: null, profit: -150 }),
    ],
  });
  check('floating risk → BREACH', state('FLOATING_RISK'), 'BREACH');
}
{
  const { state } = run('floating profit', {
    balance: 10_000,
    equity: 10_400,
    trades: [
      trade({ closedAt: null, profit: 200 }),
      trade({ closedAt: null, profit: 200 }),
    ],
  });
  check('floating profit is not risk', state('FLOATING_RISK'), 'OK');
}

console.log('\n── consistency ends the challenge ──');
{
  const trades = [
    ...fiveGoodDays(50),
    trade({ openedAt: daysAgo(6), closedAt: new Date(daysAgo(6).getTime() + 5_400_000), profit: 1_200 }),
  ];
  const { report, state } = run('one huge day', {
    balance: 11_450,
    equity: 11_450,
    trades,
  });
  check('consistency → BREACH', state('CONSISTENCY'), 'BREACH');
  check('account failed', report.status, 'FAILED');
  check('recorded as a breach', report.breaches, ['CONSISTENCY']);
}

console.log('\n── phase 2 uses the smaller target ──');
{
  const { report } = run('phase 2', {
    balance: 10_600,
    equity: 10_600,
    trades: fiveGoodDays(120),
    phase: 'PHASE_2',
  });
  check('5% target met', report.status, 'PASSED');
}

// ─────────────────────────────────────────────────────────────
// The five rules, exactly as the firm defines them.
// ─────────────────────────────────────────────────────────────

const mins = (n: number) => n * 60_000;
/** A trade held for `seconds`, closed `hoursBack` hours ago. */
function held(seconds: number, profit: number, hoursBack = 5): MonitorTrade {
  const closedAt = hoursAgo(hoursBack);
  return {
    symbol: 'XAUUSD',
    profit,
    openedAt: new Date(closedAt.getTime() - seconds * 1000),
    closedAt,
  };
}

console.log('\n── sub-minute trades ──');
{
  // 10k account, 10% target = $1000. Five clean days of $100 = $500, plus a
  // 30-second scalp of $400 today. Gross equity of $900 would be most of the
  // way to target; countable profit must stay at $500. The scalp is kept under
  // half the target so this isolates the hold-time rule from consistency.
  const { report, state } = run('scalp profit voided', {
    balance: 10_900,
    equity: 10_900,
    trades: [...fiveGoodDays(100), held(30, 400, 6)],
  });
  check('voided profit = the scalp', report.voidedProfit, 400);
  check('countable profit excludes it', report.profit - report.voidedProfit, 500);
  check('target NOT met on scalp profit', state('PROFIT_TARGET'), 'OK');
  check('does not fail the account', report.status, 'ACTIVE');
  check('reported, not punished', state('MIN_HOLD_TIME'), 'WARN');
  check('no hard breach', report.breaches, []);
}
{
  // A sub-minute *loss* is real and must count against the trader.
  const { report } = run('scalp loss counted', {
    balance: 9_700,
    equity: 9_700,
    trades: [...fiveGoodDays(0), held(30, -300, 6)],
  });
  check('loss is not voided', report.voidedProfit, 0);
  check('loss reduces profit', report.profit, -300);
}
{
  // A voided win must not reach the consistency rule either. $900 of scalping
  // in a single day is 90% of the $1000 target — it would breach outright if it
  // counted. It does not exist as far as the objectives go, so the account
  // lives and simply gets no credit.
  const { report, state } = run('scalp cannot breach consistency', {
    balance: 10_900,
    equity: 10_900,
    trades: [...fiveGoodDays(0), held(20, 900, 6)],
  });
  check('consistency untouched', state('CONSISTENCY'), 'OK');
  check('account alive', report.status, 'ACTIVE');
  check('all 900 voided', report.voidedProfit, 900);
  check('nothing counts towards target', state('PROFIT_TARGET'), 'OK');
}
{
  // But a legitimate win on the same day still counts in full.
  const { report, state } = run('real win beside a scalp', {
    balance: 10_900,
    equity: 10_900,
    trades: [...fiveGoodDays(0), held(20, 400, 6), held(3_600, 500, 7)],
  });
  check('only the scalp is voided', report.voidedProfit, 400);
  // The genuine win is the whole of countable profit, so consistency notices
  // it — a warning here rather than a breach only because the target is not
  // met yet. Had the scalp counted too, the share would have been diluted.
  check('the real 500 counts', state('CONSISTENCY'), 'WARN');
}
{
  // Voiding must not leak into the daily drawdown. Today: a 20-second win of
  // +500 and a real loss of -700, so the broker's balance moved 10,000 → 9,800
  // and the day is genuinely down 200. Measuring the day with voided figures
  // would report a 700 loss and could fail the account on money it never lost.
  const win = held(20, 500, 4);
  const loss = held(3_600, -700, 3);
  const { report } = run('daily drawdown uses real money', {
    balance: 9_800,
    equity: 9_800,
    trades: [win, loss],
  });
  const daily = report.rules.find((r) => r.key === 'DAILY_DRAWDOWN');
  check('daily loss is the real 200', Math.round(daily?.used ?? -1), 200);
  check('not the voided 700', daily?.state, 'OK');
}

console.log('\n── consistency: best day as a share of total profit ──');
{
  // Five days of $100 plus one day of $500 = $1000 total, of which the best
  // day is exactly half. Reaching the cap is a violation.
  const { report, state } = run('best day is half the profit', {
    balance: 11_000,
    equity: 11_000,
    trades: [...fiveGoodDays(100), trade({ openedAt: daysAgo(6), closedAt: new Date(daysAgo(6).getTime() + mins(90)), profit: 500 })],
  });
  check('breached', state('CONSISTENCY'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // The same $500 day inside a much larger total is a modest share, so it
  // passes. This is what a target-based formula got wrong: it punished the
  // trader for earning more.
  const { report, state } = run('same day, larger total', {
    balance: 12_000,
    equity: 12_000,
    trades: [...fiveGoodDays(300), trade({ openedAt: daysAgo(6), closedAt: new Date(daysAgo(6).getTime() + mins(90)), profit: 500 })],
  });
  check('allowed', state('CONSISTENCY'), 'OK');
  // $2000 of profit against a $1000 target, spread consistently: it passes.
  check('challenge passed', report.status, 'PASSED');
}
{
  // Funded accounts have no target, so a target-based formula could not be
  // applied to them at all. This one works there too.
  const { state } = run('applies to funded accounts', {
    balance: 11_000,
    equity: 11_000,
    trades: [...fiveGoodDays(100), trade({ openedAt: daysAgo(6), closedAt: new Date(daysAgo(6).getTime() + mins(90)), profit: 500 })],
    phase: 'FUNDED',
  });
  check('breached', state('CONSISTENCY'), 'BREACH');
}

console.log('\n── floating risk: only with two or more open positions ──');
{
  // A single position at -4% is fine; the daily drawdown alone governs it.
  // The rule reads as "within limit" with nothing counted against it, not as a
  // switched-off rule — OFF is reserved for a limit of zero.
  const { report, state } = run('one open position at -4%', {
    balance: 10_000,
    equity: 9_600,
    trades: [...fiveGoodDays(0), { symbol: 'XAUUSD', profit: -400, openedAt: hoursAgo(1), closedAt: null }],
  });
  check('reads as within limit', state('FLOATING_RISK'), 'OK');
  check('nothing counted against it', report.rules.find((r) => r.key === 'FLOATING_RISK')?.used, 0);
  check('daily drawdown still watching', state('DAILY_DRAWDOWN'), 'WARN');
}
{
  // Two positions losing 2.6% combined → breach.
  const { report, state } = run('two open positions at -2.6%', {
    balance: 10_000,
    equity: 9_740,
    trades: [
      ...fiveGoodDays(0),
      { symbol: 'XAUUSD', profit: -130, openedAt: hoursAgo(1), closedAt: null },
      { symbol: 'XAUUSD', profit: -130, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('breached', state('FLOATING_RISK'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // Two positions, combined loss of 1.5% — comfortably inside the limit.
  const { report, state } = run('two open positions at -1.5%', {
    balance: 10_000,
    equity: 9_850,
    trades: [
      ...fiveGoodDays(0),
      { symbol: 'XAUUSD', profit: -75, openedAt: hoursAgo(1), closedAt: null },
      { symbol: 'XAUUSD', profit: -75, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('within limit', state('FLOATING_RISK'), 'OK');
  check('account alive', report.status, 'ACTIVE');
}
{
  // 2.4% — close enough to warn the trader, but not a breach.
  const { report, state } = run('two open positions at -2.4%', {
    balance: 10_000,
    equity: 9_760,
    trades: [
      ...fiveGoodDays(0),
      { symbol: 'XAUUSD', profit: -120, openedAt: hoursAgo(1), closedAt: null },
      { symbol: 'XAUUSD', profit: -120, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('warned, not breached', state('FLOATING_RISK'), 'WARN');
  check('account alive', report.status, 'ACTIVE');
}

console.log('\n── trading days: one per day a trade was placed ──');
{
  const { report } = run('three separate days', {
    balance: 10_000,
    equity: 10_000,
    trades: [1, 2, 3].map((d) =>
      trade({ openedAt: daysAgo(d), closedAt: new Date(daysAgo(d).getTime() + mins(90)), profit: 0 }),
    ),
  });
  const days = report.rules.find((r) => r.key === 'MIN_TRADING_DAYS')?.used;
  check('counted 3', days, 3);
}
{
  const { report } = run('four trades, same day', {
    balance: 10_000,
    equity: 10_000,
    trades: [1, 2, 3, 4].map((h) =>
      trade({ openedAt: hoursAgo(h), closedAt: new Date(hoursAgo(h).getTime() + mins(30)), profit: 0 }),
    ),
  });
  const days = report.rules.find((r) => r.key === 'MIN_TRADING_DAYS')?.used;
  check('counted 1', days, 1);
}
{
  // Still open, placed today — the day counts.
  const { report } = run('open position counts its day', {
    balance: 10_000,
    equity: 10_000,
    trades: [{ symbol: 'XAUUSD', profit: 5, openedAt: hoursAgo(2), closedAt: null }],
  });
  const days = report.rules.find((r) => r.key === 'MIN_TRADING_DAYS')?.used;
  check('counted 1', days, 1);
}

console.log('\n── HFT cooldown: fifteen minutes after a losing close ──');
{
  const loss = held(600, -100, 5); // closed 5 hours ago
  const tooSoon: MonitorTrade = {
    symbol: 'XAUUSD',
    profit: 50,
    openedAt: new Date((loss.closedAt as Date).getTime() + mins(3)),
    closedAt: new Date((loss.closedAt as Date).getTime() + mins(40)),
  };
  const { report, state } = run('re-entered after 3 minutes', {
    balance: 9_950,
    equity: 9_950,
    trades: [...fiveGoodDays(0), loss, tooSoon],
  });
  check('breached', state('HFT_COOLDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  const loss = held(600, -100, 5);
  const waited: MonitorTrade = {
    symbol: 'XAUUSD',
    profit: 50,
    openedAt: new Date((loss.closedAt as Date).getTime() + mins(16)),
    closedAt: new Date((loss.closedAt as Date).getTime() + mins(40)),
  };
  const { report, state } = run('waited 16 minutes', {
    balance: 9_950,
    equity: 9_950,
    trades: [...fiveGoodDays(0), loss, waited],
  });
  check('allowed', state('HFT_COOLDOWN'), 'OK');
  check('account alive', report.status, 'ACTIVE');
}
{
  // A winning close carries no cooldown.
  const win = held(600, 100, 5);
  const soonAfter: MonitorTrade = {
    symbol: 'XAUUSD',
    profit: 20,
    openedAt: new Date((win.closedAt as Date).getTime() + mins(1)),
    closedAt: new Date((win.closedAt as Date).getTime() + mins(30)),
  };
  const { state } = run('no cooldown after a win', {
    balance: 10_120,
    equity: 10_120,
    trades: [...fiveGoodDays(0), win, soonAfter],
  });
  check('allowed', state('HFT_COOLDOWN'), 'OK');
}

console.log('\n── drawdown follows the worst point, not the poll ──');
{
  // The case that started this: a trade runs 600 down, recovers, and closes
  // 300 up. A two-minute poll only ever sees a winning account.
  const t = held(3_600, 300, 2);
  const { report, state } = run('dip of 600 that closed +300', {
    balance: 10_300,
    equity: 10_300,
    dayLowEquity: 9_400, // what the agent saw between pushes
    lowestEquity: 9_400,
    trades: [t],
  });
  const daily = report.rules.find((r) => r.key === 'DAILY_DRAWDOWN');
  check('daily drawdown sees the 600', Math.round(daily?.used ?? -1), 600);
  check('and breaches the 500 limit', state('DAILY_DRAWDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // Same shape, but the dip stayed inside the limit.
  const t = held(3_600, 300, 2);
  const { report, state } = run('dip of 200 that closed +300', {
    balance: 10_300,
    equity: 10_300,
    dayLowEquity: 9_800,
    lowestEquity: 9_800,
    trades: [t],
  });
  check('within the daily limit', state('DAILY_DRAWDOWN'), 'OK');
  check('account alive', report.status, 'ACTIVE');
}
{
  // No sampled low reported (an older agent): fall back to the snapshot.
  const t = held(3_600, 300, 2);
  const { state } = run('no samples reported', {
    balance: 10_300,
    equity: 10_300,
    trades: [t],
  });
  check('falls back to the snapshot', state('DAILY_DRAWDOWN'), 'OK');
}
{
  // A floating breach that has already happened stays a breach after the
  // positions close, even though nothing is open at check time.
  const { report, state } = run('floating breach then closed', {
    balance: 10_000,
    equity: 10_000,
    worstFloating: 300, // limit is 250
    trades: [...fiveGoodDays(0)],
  });
  check('still counted', state('FLOATING_RISK'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // The overall drawdown uses the all-time low the same way.
  const { report, state } = run('overall low breaches', {
    balance: 10_200,
    equity: 10_200,
    lowestEquity: 8_900, // 1100 below start, limit is 1000
    trades: [...fiveGoodDays(0)],
  });
  check('max drawdown sees it', state('MAX_DRAWDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}

// ─────────────────────────────────────────────────────────────
// Method checks: these mirror how brokers and prop firms compute
// the objectives, with this firm's own numbers.
// ─────────────────────────────────────────────────────────────

console.log('\n── profit target: closed balance, all positions flat ──');
{
  // Balance 11,000 = target reached, and nothing is open.
  const { report, state } = run('target reached, flat', {
    balance: 11_000,
    equity: 11_000,
    trades: fiveGoodDays(200),
  });
  check('target met', state('PROFIT_TARGET'), 'MET');
  check('stage passed', report.status, 'PASSED');
}
{
  // Same balance, but a position is still open. Floating profit is not profit,
  // and an open trade can still turn: the stage must not pass yet.
  const { report, state } = run('target reached, still holding', {
    balance: 11_000,
    equity: 11_400,
    trades: [
      ...fiveGoodDays(200),
      { symbol: 'XAUUSD', profit: 400, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('not yet met', state('PROFIT_TARGET'), 'OK');
  check('stage not passed', report.status, 'ACTIVE');
  check('explains why', report.rules.find((r) => r.key === 'PROFIT_TARGET')?.detail, 'open');
}
{
  // Floating profit alone must never reach the target.
  const { report, state } = run('only floating profit', {
    balance: 10_000,
    equity: 11_500,
    trades: [
      ...fiveGoodDays(0),
      { symbol: 'XAUUSD', profit: 1_500, openedAt: hoursAgo(1), closedAt: null },
    ],
  });
  check('target not reached', state('PROFIT_TARGET'), 'OK');
  check('account still active', report.status, 'ACTIVE');
}

console.log('\n── daily limit measured from the day-start balance ──');
{
  // Broker method: floor = balance carried into the day − 5% of the INITIAL
  // balance. Day started at 12,000 on a 10,000 account, so the floor is 11,500
  // regardless of how much the account has grown.
  const { report, state } = run('grown account, day-start reference', {
    balance: 11_600,
    equity: 11_600,
    dayStartBalance: 12_000,
    trades: [...fiveGoodDays(0)],
  });
  const daily = report.rules.find((r) => r.key === 'DAILY_DRAWDOWN');
  check('loss measured from 12,000', Math.round(daily?.used ?? -1), 400);
  check('allowance is 5% of initial', Math.round(daily?.limit ?? -1), 500);
  // 400 of 500 is 80% — close enough to warn, not to fail.
  check('warned, not breached', state('DAILY_DRAWDOWN'), 'WARN');
  check('no hard breach', report.breaches, []);
}
{
  const { state } = run('comfortably inside', {
    balance: 11_800,
    equity: 11_800,
    dayStartBalance: 12_000,
    trades: [...fiveGoodDays(0)],
  });
  check('within limit', state('DAILY_DRAWDOWN'), 'OK');
}
{
  const { report, state } = run('same day, limit breached', {
    balance: 11_450,
    equity: 11_450,
    dayStartBalance: 12_000,
    trades: [...fiveGoodDays(0)],
  });
  check('breached at 550', state('DAILY_DRAWDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}
{
  // The stored reference wins over reconstructing it from today's trades, so
  // incomplete trade history can no longer distort the daily figure.
  const lossToday = held(3_600, -300, 2);
  const { report } = run('stored reference beats reconstruction', {
    balance: 9_700,
    equity: 9_700,
    dayStartBalance: 10_000,
    trades: [lossToday],
  });
  const daily = report.rules.find((r) => r.key === 'DAILY_DRAWDOWN');
  check('uses the stored 10,000', Math.round(daily?.used ?? -1), 300);
}

console.log('\n── overall limit is a static floor on equity ──');
{
  // 10% of the initial balance, fixed. Growing the account does not raise it.
  const { report, state } = run('static floor', {
    balance: 12_000,
    equity: 12_000,
    lowestEquity: 8_950, // dipped below 9,000 earlier in the challenge
    trades: [...fiveGoodDays(0)],
  });
  check('breached on the old dip', state('MAX_DRAWDOWN'), 'BREACH');
  check('account failed', report.status, 'FAILED');
}

console.log(
  failures === 0
    ? '\nAll monitor checks passed.\n'
    : `\n${failures} monitor check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
