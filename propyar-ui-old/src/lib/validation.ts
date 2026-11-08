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
  paymentMethod: z.enum(['paystar', 'usdt', 'mock']).default('paystar'),
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
  action: z.enum(['DISABLE', 'PASS', 'FUND', 'FAIL']),
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
  // Largest combined floating loss seen while 2+ positions were open.
  floatingWorst: z.number().nonnegative().optional(),
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
