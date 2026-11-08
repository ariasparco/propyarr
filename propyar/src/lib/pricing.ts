import 'server-only';
import { prisma } from './prisma';

// Works out what a challenge actually costs once a discount code and store
// credit are applied. The same function backs the checkout preview and the
// order itself, so what the customer is quoted is what they are charged.

export type DiscountProblem =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'USED_UP'
  | 'WRONG_PLAN';

export type Quote = {
  listPrice: number;
  discountCode: string | null;
  discountAmount: number;
  /** Price after the discount, before store credit. */
  payable: number;
  walletAvailable: number;
  walletApplied: number;
  /** What still has to be paid by card or crypto. */
  dueNow: number;
  discountProblem: DiscountProblem | null;
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function findDiscount(code: string, challengeId: string) {
  const row = await prisma.discountCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!row) return { row: null, problem: 'NOT_FOUND' as DiscountProblem };
  if (!row.active) return { row, problem: 'INACTIVE' as DiscountProblem };
  if (row.expiresAt && row.expiresAt < new Date())
    return { row, problem: 'EXPIRED' as DiscountProblem };
  if (row.maxUses !== null && row.usedCount >= row.maxUses)
    return { row, problem: 'USED_UP' as DiscountProblem };
  if (row.challengeId && row.challengeId !== challengeId)
    return { row, problem: 'WRONG_PLAN' as DiscountProblem };
  return { row, problem: null };
}

export async function quote(input: {
  userId: string;
  challengeId: string;
  listPrice: number;
  code?: string;
  /** Whether the trader chose to spend their credit on this purchase. */
  useWallet: boolean;
}): Promise<Quote> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { walletBalance: true },
  });
  const walletAvailable = round(user?.walletBalance ?? 0);

  let discountAmount = 0;
  let discountCode: string | null = null;
  let discountProblem: DiscountProblem | null = null;

  const raw = input.code?.trim();
  if (raw) {
    const { row, problem } = await findDiscount(raw, input.challengeId);
    discountProblem = problem;
    if (row && !problem) {
      discountCode = row.code;
      discountAmount = round((input.listPrice * row.percent) / 100);
    }
  }

  const payable = round(Math.max(0, input.listPrice - discountAmount));
  const walletApplied = input.useWallet
    ? round(Math.min(walletAvailable, payable))
    : 0;
  const dueNow = round(payable - walletApplied);

  return {
    listPrice: round(input.listPrice),
    discountCode,
    discountAmount,
    payable,
    walletAvailable,
    walletApplied,
    dueNow,
    discountProblem,
  };
}

/** Counts a code as used. Called only once an order is actually created. */
export async function consumeDiscount(code: string): Promise<void> {
  await prisma.discountCode
    .update({
      where: { code },
      data: { usedCount: { increment: 1 } },
    })
    .catch(() => undefined);
}
