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
  | 'PENDING_REQUEST'
  | 'OPEN_POSITIONS';

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
  /** Closed balance. Withdrawals are paid from realised money only. */
  balance: number;
  equity: number;
  startingBalance: number;
  profitSplit: number;
  fundedAt: Date | null;
  kycStatus: string;
  hasPendingRequest: boolean;
  /**
   * Profit the rule engine refused to count — sub-minute winners. It is still
   * sitting in the balance, so it has to be subtracted here or the platform
   * pays out money it has already ruled does not exist.
   */
  voidedProfit?: number;
  /** Positions still running. A withdrawal is not assessed mid-trade. */
  openPositions?: number;
}): PayoutEligibility {
  // Balance, not equity. Equity carries unrealised profit, so a trader could
  // open a winner, request the payout against it, and then close it at a loss —
  // the platform would have paid out money the account never made.
  // The lower of the two is used while positions are open, so a floating loss
  // still reduces what may be taken.
  const realised = Math.min(input.balance, input.equity);
  const countable = Math.max(
    0,
    realised - input.startingBalance - Math.max(0, input.voidedProfit ?? 0),
  );
  const grossProfit = countable;
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
  // A withdrawal is settled against a flat account. Paying out while trades are
  // running means paying against a number that has not finished moving.
  else if ((input.openPositions ?? 0) > 0) block = 'OPEN_POSITIONS';
  else if (available < PAYOUT_RULES.minAmountUsd) block = 'NO_PROFIT';

  return { eligible: block === null, block, ...base };
}
