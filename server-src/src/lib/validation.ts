import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  phone: z.string().trim().min(10).max(15),
  password: z.string().min(8).max(128),
  // A friend's code. Accepted at signup only — it can never be set later.
  referralCode: z.string().trim().max(32).optional(),
});

export const profileSchema = z.object({
  phone: z.string().trim().min(10).max(15),
});

export const kycSubmitSchema = z.object({
  docType: z.enum(['shenasnameh', 'melli']),
  image: z.string().startsWith('data:image/').max(4_000_000),
});

export const CERTIFICATE_STAGES = [
  'PHASE_1',
  'PHASE_2',
  'FUNDED',
  'PAYOUT',
] as const;

export const certificateUploadSchema = z.object({
  accountId: z.string().min(1),
  stage: z.enum(CERTIFICATE_STAGES),
  image: z.string().startsWith('data:image/').max(6_000_000),
  note: z.string().max(200).optional().default(''),
});

export const certificateDeleteSchema = z.object({
  certificateId: z.string().min(1),
});

export const adminKycActionSchema = z.object({
  kycId: z.string().min(1),
  action: z.enum(['APPROVE', 'REJECT']),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotSchema = z.object({
  email: z.string().email().max(120),
  locale: z.string().max(5).optional(),
});

export const verifyEmailSchema = z.object({
  email: z.string().email().max(120),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'six digits'),
});

export const resetSchema = z.object({
  email: z.string().email().max(120),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'six digits'),
  password: z.string().min(8).max(128),
});

export const orderSchema = z.object({
  challengeId: z.string().min(1),
  paymentMethod: z.enum(['card', 'paystar', 'usdt', 'mock']).default('card'),
  discountCode: z.string().trim().max(32).optional(),
  useWallet: z.boolean().optional().default(false),
});

export const quoteSchema = z.object({
  challengeId: z.string().min(1),
  discountCode: z.string().trim().max(32).optional(),
  useWallet: z.boolean().optional().default(false),
});

export const walletTopupSchema = z.object({
  amount: z.number().positive().max(100_000),
});

export const adminWalletSchema = z.object({
  userId: z.string().min(1),
  amount: z
    .number()
    .gte(-100_000)
    .lte(100_000)
    .refine((n) => n !== 0, 'must not be zero'),
  note: z.string().trim().max(200).optional().default(''),
});

export const discountCodeSchema = z.object({
  code: z.string().trim().min(3).max(32),
  percent: z.number().int().min(1).max(100),
  challengeId: z.string().min(1).optional().nullable(),
  maxUses: z.number().int().min(1).max(100_000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const discountToggleSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['TOGGLE', 'DELETE']),
});

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(5).max(4000),
});

export const ticketReplySchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
});

export const ticketStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']),
});

export const payoutSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  method: z.enum(['usdt', 'sheba', 'card']).default('usdt'),
  wallet: z.string().min(3).max(200),
});

export const contactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  subject: z.string().min(2).max(160),
  message: z.string().min(5).max(4000),
});

export const adminPayoutActionSchema = z.object({
  payoutId: z.string().min(1),
  action: z.enum(['APPROVE', 'REJECT', 'MARK_PAID']),
});

export const adminAccountActionSchema = z.object({
  accountId: z.string().min(1),
  action: z.enum([
    'DISABLE',
    'PASS',
    'FUND',
    'FAIL',
    'ASSIGN',
    'CREDENTIALS',
    'DELETE',
  ]),
  // ASSIGN only: the trader this account really belongs to. Certificates,
  // payouts and the dashboard all read the owner, so an account attached to the
  // wrong user issues that user's name on the trader's certificate.
  userEmail: z.string().email().max(200).optional(),
  // CREDENTIALS only: what the monitoring terminal signs in with.
  //
  // These are typed by hand and could not be corrected afterwards. A password
  // that no longer works does not raise an error — MetaTrader quietly opens a
  // new demo account instead and monitors that one, so the mistake is invisible
  // until someone reads the terminal's log.
  accountNumber: z.string().min(1).max(40).optional(),
  server: z.string().min(1).max(80).optional(),
  // Omitted means "keep what is stored". Sending an empty string would clear a
  // working password just by opening the form and saving.
  password: z.string().min(1).max(200).optional(),
  investorPassword: z.string().min(1).max(200).optional(),
  // FAIL / DISABLE only: the admin's explanation, shown to the trader as written.
  //
  // Required on FAIL — enforced in the route, not here, so the reason for the
  // rejection can be specific. A manual verdict carries no rule and no figures,
  // so without this the trader is told their account failed and nothing else.
  note: z.string().trim().min(3).max(1000).optional(),
});

/**
 * Staff's verdict on a trader's request to move to the next stage.
 *
 * The note is required either way. An approval that says nothing is fine for
 * the platform and useless to the trader; a refusal that says nothing is worse.
 */
export const orderReviewSchema = z.object({
  orderId: z.string().min(1),
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(3).max(1000),
  // REJECT only: the request was refused because the account broke a rule, so
  // the account itself is closed and carries the same explanation.
  failAccount: z.boolean().optional().default(false),
});

export const completeOrderSchema = z.object({
  orderId: z.string().min(1),
  accountNumber: z.string().min(1).max(40),
  password: z.string().min(1).max(100),
  // Read-only password. The monitoring agent signs in with this to read the
  // account; it cannot place trades. Optional so an account can be handed over
  // before monitoring is set up.
  investorPassword: z.string().max(100).optional().default(''),
  server: z.string().min(1).max(80),
  // Optional MetaApi id — set it to put the account under live monitoring.
  metaApiId: z.string().max(80).optional().default(''),
  platform: z.string().max(40).optional().default('MT5'),
});

// Terminal bridge payload. Kept deliberately permissive about extra fields so
// different agents (Python, MQL5, broker scripts) can all post to it.
// Timestamps arrive from whatever agent is feeding the bridge. Python's
// isoformat() writes "+00:00" where zod's default only accepts "Z", which
// silently rejected every push that actually carried trades. Accept both.
const bridgeTime = z.string().datetime({ offset: true });

const bridgeDealSchema = z.object({
  ticket: z.union([z.string(), z.number()]).transform(String),
  symbol: z.string().min(1).max(30),
  type: z.enum(['BUY', 'SELL']),
  lot: z.number().nonnegative(),
  profit: z.number(),
  openPrice: z.number().optional(),
  closePrice: z.number().optional(),
  openedAt: bridgeTime,
  closedAt: bridgeTime,
});

const bridgePositionSchema = z.object({
  symbol: z.string().min(1).max(30),
  profit: z.number(),
  lot: z.number().nonnegative().optional(),
  openedAt: bridgeTime,
});

export const bridgeAccountSchema = z.object({
  accountNumber: z.string().min(1).max(40),
  balance: z.number(),
  equity: z.number(),
  // Sampled between pushes, so a dip that recovers before the next snapshot is
  // still reported. Absent from older agents, hence optional.
  equityLow: z.number().optional(),
  // The same for balance. It moves only on a close, but two closes inside one
  // push window can take it under the line and back, and the rules bind a drop
  // in balance as firmly as a drop in equity.
  balanceLow: z.number().optional(),
  // The broker's UTC offset in hours, measured by the terminal. Half-hour
  // offsets are real (India, Iran), so this is not an integer.
  serverUtcOffset: z.number().min(-12).max(14).optional(),
  // Largest combined floating loss seen while a position was open.
  floatingWorst: z.number().nonnegative().optional(),
  // The same peak expressed as a share of equity at that instant. The rule is
  // a percentage of live equity, so a peak recorded in dollars cannot be judged
  // later against a different equity -- the ratio is what stays true.
  floatingWorstPct: z.number().nonnegative().max(1000).optional(),
  // Most positions open at any sample since the last push. The floating rule
  // starts at two, so without this a burst that closed before the push would
  // have its sampled loss discarded as single-position exposure.
  openCountPeak: z.number().int().nonnegative().max(1000).optional(),
  positions: z.array(bridgePositionSchema).max(500).optional(),
  deals: z.array(bridgeDealSchema).max(2000).optional(),
});
export type BridgeAccount = z.infer<typeof bridgeAccountSchema>;

export const bridgePushSchema = z.object({
  accounts: z.array(bridgeAccountSchema).min(1).max(200),
});

export const adminRulesSchema = z.object({
  consistencyRulePercent: z.number().min(1).max(100),
  fundedMinTradingDays: z.number().int().min(0).max(365),
  hftCooldownMinutes: z.number().min(0).max(240),
  minHoldSeconds: z.number().int().min(0).max(3600),
  dayResetUtcOffset: z.number().int().min(-12).max(14),
  allowedSymbols: z.array(z.string().min(1).max(20)).min(1).max(20),
  weekendHoldingAllowed: z.boolean(),
  newsTradingAllowed: z.boolean(),
});
