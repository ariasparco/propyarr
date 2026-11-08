// Rules that differ by challenge model rather than by account size.
//
// The per-size figures (targets, drawdowns, floating risk) live on each
// Challenge row. What lives here is the shape of the model itself: which
// stages an account walks through, what the main account needs before a
// payout, and how the profit split steps up with each paid withdrawal.
// One table, so the engine, the payout API and the dashboard cannot drift.

export type AccountType = 'ONE_STEP' | 'TWO_STEP' | 'INSTANT';
export type Phase = 'PHASE_1' | 'PHASE_2' | 'FUNDED';

type PlanRules = {
  /** Stages in order. The last is always the main (funded) account. */
  stages: Phase[];
  /** Trading days the main account needs before a payout. */
  fundedMinTradingDays: number;
  /** Profit, as a % of the starting balance, needed before a payout. */
  payoutTargetPct: number;
  /** Upper end of the per-payout target band shown to traders. */
  payoutTargetMaxPct: number;
  /** Trader's share on the 1st, 2nd and 3rd-onward payout. */
  splitTiers: [number, number, number];
  /** Which paid payout carries the challenge-fee refund (null = none). */
  refundWithPayout: number | null;
};

export const PLAN_RULES: Record<AccountType, PlanRules> = {
  ONE_STEP: {
    stages: ['PHASE_1', 'FUNDED'],
    fundedMinTradingDays: 15,
    payoutTargetPct: 10,
    payoutTargetMaxPct: 20,
    splitTiers: [60, 70, 80],
    refundWithPayout: 3,
  },
  TWO_STEP: {
    stages: ['PHASE_1', 'PHASE_2', 'FUNDED'],
    fundedMinTradingDays: 10,
    payoutTargetPct: 10,
    payoutTargetMaxPct: 20,
    splitTiers: [60, 70, 80],
    refundWithPayout: 3,
  },
  // Direct Real: a main account from day one, no evaluation.
  INSTANT: {
    stages: ['FUNDED'],
    fundedMinTradingDays: 10,
    payoutTargetPct: 5,
    payoutTargetMaxPct: 5,
    splitTiers: [50, 60, 70],
    refundWithPayout: null,
  },
};

/** Days of the (Gregorian) month on which payouts are processed. */
export const PAYOUT_DAYS = [14, 28];

export function planRules(accountType: string | null | undefined): PlanRules {
  return PLAN_RULES[(accountType as AccountType) ?? 'TWO_STEP'] ?? PLAN_RULES.TWO_STEP;
}

/** The stage an account of this model starts in. */
export function initialPhase(accountType: string | null | undefined): Phase {
  return planRules(accountType).stages[0];
}

/** The stage that follows `phase`, or null once the account is funded. */
export function nextPhase(
  accountType: string | null | undefined,
  phase: string,
): Phase | null {
  const stages = planRules(accountType).stages;
  const i = stages.indexOf(phase as Phase);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : null;
}

/** Trader's share for the payout after `paidCount` earlier paid payouts. */
export function splitForPayout(
  accountType: string | null | undefined,
  paidCount: number,
): number {
  const tiers = planRules(accountType).splitTiers;
  return tiers[Math.min(Math.max(0, paidCount), tiers.length - 1)];
}

/** The next payout-processing date on or after `from` (UTC calendar). */
export function nextPayoutDate(from = new Date()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const today = from.getUTCDate();
  for (const d of PAYOUT_DAYS) {
    if (d >= today) return new Date(Date.UTC(y, m, d));
  }
  return new Date(Date.UTC(y, m + 1, PAYOUT_DAYS[0]));
}
