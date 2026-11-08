import 'server-only';
import crypto from 'crypto';
import { prisma } from './prisma';

// Store credit. Every movement is written to the ledger alongside the balance
// it produced, so a balance can always be explained by its history rather than
// being a number nobody can account for.

export type WalletEntryType =
  | 'TOPUP'
  | 'PURCHASE'
  | 'REFERRAL'
  | 'ADMIN'
  | 'REFUND';

/** Share of a referred trader's purchase credited to whoever referred them. */
export const REFERRAL_PERCENT = Number(process.env.REFERRAL_PERCENT ?? 10);

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Moves credit and records it. Balance and ledger are written together, so they
 * cannot drift apart. Debits are rejected when the balance is short.
 */
export async function recordWallet(input: {
  userId: string;
  amount: number;
  type: WalletEntryType;
  note?: string;
  orderId?: string;
}): Promise<{ balance: number } | null> {
  const amount = round(input.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { walletBalance: true },
    });
    if (!user) return null;

    const balance = round(user.walletBalance + amount);
    if (balance < 0) return null; // never let a debit overdraw

    await tx.user.update({
      where: { id: input.userId },
      data: { walletBalance: balance },
    });
    await tx.walletEntry.create({
      data: {
        userId: input.userId,
        amount,
        type: input.type,
        note: input.note ?? null,
        orderId: input.orderId ?? null,
        balanceAfter: balance,
      },
    });
    return { balance };
  });
}

export async function getWallet(userId: string) {
  const [user, entries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    }),
    prisma.walletEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  return {
    balance: user?.walletBalance ?? 0,
    entries: entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      type: e.type,
      note: e.note ?? '',
      balanceAfter: e.balanceAfter,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Short, unambiguous code — no characters that can be misread for another. */
function generateReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Returns the trader's code, creating one the first time it is needed. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return code;
    } catch {
      // Collision on the unique index — try another.
    }
  }
  throw new Error('could not allocate a referral code');
}

/**
 * Pays the referrer their share of a completed purchase. Guarded by
 * referralPaidAt so a re-run of the payment flow cannot pay twice.
 */
export async function payReferralCommission(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, referredById: true } },
      challenge: { select: { name: true } },
    },
  });
  if (!order || order.referralPaidAt) return;
  if (!order.user.referredById) return;
  // Free follow-on stage accounts and wallet top-ups earn nothing.
  if (order.kind !== 'PURCHASE') return;

  // Based on what the challenge actually cost after any discount — not on the
  // balance left to pay, since store credit is money the trader already put in.
  const spent =
    order.listPrice !== null
      ? Math.max(0, order.listPrice - order.discountAmount)
      : order.amount;
  const commission = round((spent * REFERRAL_PERCENT) / 100);
  if (commission <= 0) return;

  // Claim first — a concurrent call finds the marker already set.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, referralPaidAt: null },
    data: { referralPaidAt: new Date() },
  });
  if (claimed.count === 0) return;

  await recordWallet({
    userId: order.user.referredById,
    amount: commission,
    type: 'REFERRAL',
    note: `${REFERRAL_PERCENT}% — ${order.user.name}`,
    orderId: order.id,
  });
}

export async function getReferralSummary(userId: string) {
  const code = await ensureReferralCode(userId);
  const [invited, earnings] = await Promise.all([
    prisma.user.findMany({
      where: { referredById: userId },
      select: { name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.walletEntry.aggregate({
      where: { userId, type: 'REFERRAL' },
      _sum: { amount: true },
    }),
  ]);

  return {
    code,
    percent: REFERRAL_PERCENT,
    invitedCount: invited.length,
    totalEarned: round(earnings._sum.amount ?? 0),
    invited: invited.map((u) => ({
      // Only a first name — invitees are not on display to each other.
      name: u.name.split(' ')[0],
      joinedAt: u.createdAt.toISOString(),
    })),
  };
}
