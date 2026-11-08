import 'server-only';
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
  worstFloating: number | null;
};

export type Observation = {
  balance: number;
  equity: number;
  /** Lowest equity seen since the last observation, when the source samples. */
  equityLow?: number | null;
  /** Worst combined floating loss seen while two or more positions were open. */
  floatingWorst?: number | null;
  /** How many positions are open right now. */
  openCount?: number;
};

export function nextWatermarks(
  current: Watermarks,
  obs: Observation,
  dayResetUtcOffset: number,
  now: Date = new Date(),
): Watermarks {
  const today = dayKey(now, dayResetUtcOffset);

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

  const dayStartBalance = seeding
    ? sameDay
      ? // First sight of this account since the reference existed. Nothing
        // earlier in the day is knowable, so the day starts here.
        obs.balance
      : // A real rollover: the balance carried in from before the reset.
        (current.dayStartBalance ?? obs.balance)
    : current.dayStartBalance;

  const dayLowEquity = seeding
    ? sampledLow
    : Math.min(current.dayLowEquity ?? sampledLow, sampledLow);

  // Floating risk only counts from the second open position onward, and a
  // breach that already happened stays a breach after the positions close.
  const floatingNow =
    (obs.openCount ?? 0) >= 2 ? Math.max(0, obs.balance - obs.equity) : 0;

  return {
    dayStartBalance,
    dayLowKey: today,
    dayLowEquity,
    lowestEquity: Math.min(current.lowestEquity ?? sampledLow, sampledLow),
    worstFloating: Math.max(
      current.worstFloating ?? 0,
      obs.floatingWorst ?? 0,
      floatingNow,
    ),
  };
}
