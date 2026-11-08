import 'server-only';
import { prisma } from './prisma';

export type PayoutContext = {
  /** Payouts on this account that were actually paid. */
  paidCount: number;
  /** What the trader paid for the challenge that led to this account. */
  challengeFee: number;
};

/**
 * The account-history facts a payout decision needs beyond the account row.
 *
 * The fee lives on the original purchase, not on the funded account's own
 * order: follow-on stages are issued through free (amount 0) orders that point
 * back at the account they came from. Walk that chain to the purchase and take
 * what was actually paid there, cash plus wallet credit, after any discount.
 */
export async function getPayoutContext(
  accountIds: string[],
): Promise<Map<string, PayoutContext>> {
  const out = new Map<string, PayoutContext>();
  if (accountIds.length === 0) return out;

  const paid = await prisma.payout.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accountIds }, status: 'PAID' },
    _count: { _all: true },
  });
  const paidBy = new Map(paid.map((p) => [p.accountId, p._count._all]));

  for (const id of accountIds) {
    out.set(id, {
      paidCount: paidBy.get(id) ?? 0,
      challengeFee: await feePaidFor(id),
    });
  }
  return out;
}

async function feePaidFor(accountId: string): Promise<number> {
  let current: string | null = accountId;
  // A chain is at most PHASE_1 → PHASE_2 → FUNDED; the bound only guards
  // against a malformed loop in the data.
  for (let hop = 0; current && hop < 5; hop++) {
    const account: { orderId: string | null } | null =
      await prisma.tradingAccount.findUnique({
        where: { id: current },
        select: { orderId: true },
      });
    if (!account?.orderId) return 0;
    const order: {
      amount: number;
      walletAmount: number;
      kind: string;
      sourceAccountId: string | null;
    } | null = await prisma.order.findUnique({
      where: { id: account.orderId },
      select: { amount: true, walletAmount: true, kind: true, sourceAccountId: true },
    });
    if (!order) return 0;
    const paid = order.amount + order.walletAmount;
    if (order.kind === 'PURCHASE' || !order.sourceAccountId) return paid;
    current = order.sourceAccountId;
  }
  return 0;
}
