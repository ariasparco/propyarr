import 'server-only';

// Who may withdraw, how much, and when. Shared by the payout API and the
// dashboard so the form never offers an amount the API would reject.

export const PAYOUT_RULES = {
  minAmountUsd: Number(process.env.PAYOUT_MIN_USD ?? 50),
  minDaysSinceFunded: Number(process.env.PAYOUT_MIN_DAYS ?? 14),
};

export type PayoutBlock =
  | 'NOT_FUNDED'
  | 'KYC_REQUIRED'
  | 'NO_PROFIT'
  | 'WAITING_PERIOD'
  | 'PENDING_REQUEST';

export type PayoutEligibility = {
  eligible: boolean;
  block: PayoutBlock | null;
  /** Trader's share of the profit, after the split. */
  available: number;
  minAmount: number;
  daysRemaining: number;
};

export function daysSince(from: Date | null): number {
  if (!from) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - from.getTime()) / 86_400_000);
}

export function evaluatePayout(input: {
  status: string;
  equity: number;
  startingBalance: number;
  profitSplit: number;
  fundedAt: Date | null;
  kycStatus: string;
  hasPendingRequest: boolean;
}): PayoutEligibility {
  const grossProfit = Math.max(0, input.equity - input.startingBalance);
  const available =
    Math.floor(grossProfit * (input.profitSplit / 100) * 100) / 100;
  const elapsed = daysSince(input.fundedAt);
  const daysRemaining = Number.isFinite(elapsed)
    ? Math.max(0, PAYOUT_RULES.minDaysSinceFunded - elapsed)
    : PAYOUT_RULES.minDaysSinceFunded;

  const base = {
    available,
    minAmount: PAYOUT_RULES.minAmountUsd,
    daysRemaining,
  };

  let block: PayoutBlock | null = null;
  if (input.status !== 'FUNDED') block = 'NOT_FUNDED';
  else if (input.kycStatus !== 'APPROVED') block = 'KYC_REQUIRED';
  else if (input.hasPendingRequest) block = 'PENDING_REQUEST';
  else if (daysRemaining > 0) block = 'WAITING_PERIOD';
  else if (available < PAYOUT_RULES.minAmountUsd) block = 'NO_PROFIT';

  return { eligible: block === null, block, ...base };
}
