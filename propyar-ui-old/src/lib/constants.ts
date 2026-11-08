// Central place for enum-like values + brand config.

export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? 'PROPYAR',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  // Marketing contact details
  email: 'support@propyar.top',
  twitter: '@propyar_top',
  telegram: 'propyar_top',
  foundedYear: 2024,
} as const;

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const KYC_STATUS = ['NONE', 'PENDING', 'APPROVED', 'REJECTED'] as const;

export const PAYMENT_STATUS = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const ACCOUNT_STATUS = [
  'ACTIVE',
  'PASSED',
  'FAILED',
  'FUNDED',
  'DISABLED',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUS)[number];

export const ACCOUNT_PHASE = ['PHASE_1', 'PHASE_2', 'FUNDED'] as const;
export type AccountPhase = (typeof ACCOUNT_PHASE)[number];

export const PAYOUT_STATUS = [
  'REQUESTED',
  'APPROVED',
  'PAID',
  'REJECTED',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUS)[number];

export const TRADING_PLATFORMS = [
  'MT5',
  'cTrader',
  'MatchTrader',
  'TradeLocker',
] as const;

export const CHALLENGE_TYPES = ['ONE_STEP', 'TWO_STEP', 'INSTANT'] as const;

// Challenge evaluation rule defaults (admin-overridable via Setting model)
export const DEFAULT_RULES = {
  weekendHoldingAllowed: true,
  newsTradingAllowed: false,
  consistencyRulePercent: 50, // no single day > 50% of total profit
  minTradingDays: 5,
} as const;
