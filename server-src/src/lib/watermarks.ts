// Pure arithmetic — no database, no environment, no I/O — so the marks the
// whole rule engine is judged against can be tested directly. It carried a
// `server-only` import purely by habit, which put the one piece of state that
// cannot be recomputed from trade history beyond the reach of the test suite.
import { dayKey } from './monitor';

/**
 * The worst points an account has reached, kept alongside the live figures.
 *
 * Equity read at a poll says nothing about what happened between polls: a trade
 * that runs 600 down and closes 300 up is a real 600 drawdown that a snapshot
 * would never show. These marks are what let the engine judge the worst moment
 * rather than the convenient one.
 *
 * Both data paths must agree on how they are kept, so the arithmetic lives here
 * rather than being written twice — once in the bridge ingest for the terminal
 * agent, once in the monitor for MetaApi. Two copies would drift.
 */
export type Watermarks = {
  dayStartBalance: number | null;
  dayLowKey: string | null;
  dayLowEquity: number | null;
  lowestEquity: number | null;
  // Balance is bound by the drawdown rules alongside equity, and tracking only
  // equity misses the case the rules describe: a closing loss drags balance
  // under the line while a second, winning position keeps equity above it.
  dayLowBalance: number | null;
  lowestBalance: number | null;
  worstFloating: number | null;
  worstFloatingPct: number | null;
};

export type Observation = {
  balance: number;
  equity: number;
  /** Lowest equity seen since the last observation, when the source samples. */
  equityLow?: number | null;
  /** Lowest balance seen since the last observation. */
  balanceLow?: number | null;
  /** Worst combined floating loss seen while a position was open. */
  floatingWorst?: number | null;
  /** That same peak as a share of the equity it was measured against. */
  floatingWorstPct?: number | null;
  /** How many positions are open right now. */
  openCount?: number;
  /**
   * Highest number of positions open at any sample since the last observation,
   * so a burst that opened and closed between pushes still has its floating
   * figure counted.
   */
  openCountPeak?: number | null;
};

/** A balance this far below the day's reference is a real loss, not bad data. */
function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function nextWatermarks(
  current: Watermarks,
  obs: Observation,
  dayResetUtcOffset: number,
  now: Date = new Date(),
): Watermarks {
  const today = dayKey(now, dayResetUtcOffset);

  // A reading of zero on both figures is not an account state any broker
  // reports — it is what a terminal returns before it has connected. Folding it
  // in records an equity floor of zero, and since the floor is sticky every
  // drawdown afterwards is measured against it: a healthy account was failed at
  // 2006% of its daily limit before its first tick had arrived.
  //
  // The marks are left exactly as they were. A genuinely wiped account still
  // reports a real balance, so nothing real is discarded here.
  if (obs.balance === 0 && obs.equity === 0) {
    return { ...current, dayLowKey: current.dayLowKey };
  }

  const sampledLow = Math.min(
    obs.equity,
    obs.equityLow ?? Number.POSITIVE_INFINITY,
  );

  // The daily reference and the daily low have to be established together.
  // Pairing a reference taken now with a low recorded earlier measures the day
  // from two different moments, and the gap shows up as a loss the account
  // never took — enough to fail a trader who is up on the day.
  const sameDay = current.dayLowKey === today;
  const seeding = !sameDay || current.dayStartBalance == null;

  // On rollover to a new trading day, the new day's reference is the balance
  // carried in. Nothing is clamped afterwards: a reference far above the
  // current balance is exactly what a bad day looks like, and the "sanity
  // check" that used to rewrite it turned a 60% daily loss into a reported
  // zero. Non-finite input is the only thing rejected here, and it is rejected
  // by keeping the previous mark rather than by inventing a new one.
  const dayStartBalance: number | null = seeding
    ? finite(obs.balance)
      ? obs.balance
      : current.dayStartBalance
    : current.dayStartBalance;

  // On rollover the daily low restarts from the equity observed at the start of
  // the new day; within a day it only ever moves down. Negative equity is a
  // real state for a blown account and must survive — clamping it away reported
  // "no drawdown" on precisely the accounts that had the most.
  const dayLowEquity: number | null = !finite(sampledLow)
    ? current.dayLowEquity
    : seeding
      ? sampledLow
      : Math.min(current.dayLowEquity ?? sampledLow, sampledLow);

  // The lowest balance actually reached, not the one the push happened to
  // catch. Two closes inside one window -- a loser then a winner -- take the
  // balance under the line and back above it, and reading only at push time
  // misses the breach entirely.
  const sampledBalance = Math.min(
    obs.balance,
    obs.balanceLow ?? Number.POSITIVE_INFINITY,
  );
  const dayLowBalance: number | null = !finite(sampledBalance)
    ? current.dayLowBalance
    : seeding
      ? sampledBalance
      : Math.min(current.dayLowBalance ?? sampledBalance, sampledBalance);

  // Floating risk counts from the first open position.
  //
  // A two-position minimum was applied here on an earlier reading of the rule.
  // The published text binds "the combined loss of open trades at any moment"
  // with no such condition, so a single position running past the allowance is
  // a breach like any other. What must still be true is that a position is
  // open at all — otherwise the difference between balance and equity is not
  // floating risk, it is nothing.
  const openNow = obs.openCount ?? 0;
  const openPeak = Math.max(openNow, obs.openCountPeak ?? 0);
  const floatingNow = openNow >= 1 ? Math.max(0, obs.balance - obs.equity) : 0;
  const floatingSampled = openPeak >= 1 ? (obs.floatingWorst ?? 0) : 0;

  // The ratio the rule is actually written against.
  const floatingNowPct =
    openNow >= 1 && obs.equity > 0 ? (floatingNow / obs.equity) * 100 : 0;
  const floatingSampledPct = openPeak >= 1 ? (obs.floatingWorstPct ?? 0) : 0;

  return {
    dayStartBalance,
    dayLowKey: today,
    dayLowEquity,
    lowestEquity: finite(sampledLow)
      ? Math.min(current.lowestEquity ?? sampledLow, sampledLow)
      : current.lowestEquity,
    dayLowBalance,
    lowestBalance: finite(sampledBalance)
      ? Math.min(current.lowestBalance ?? sampledBalance, sampledBalance)
      : current.lowestBalance,
    worstFloating: Math.max(
      current.worstFloating ?? 0,
      floatingSampled,
      floatingNow,
    ),
    worstFloatingPct: Math.max(
      current.worstFloatingPct ?? 0,
      floatingSampledPct,
      floatingNowPct,
    ),
  };
}
