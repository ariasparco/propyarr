import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { orderReviewSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';
import { getTradingPlatform } from '@/lib/trading';

// Staff's verdict on a trader's request to move to the next stage.
//
// The stage is decided by a person reading the account against the published
// rules, not by the panel: approving leaves the request in the queue so the
// same admin can then issue the next account's credentials, and refusing closes
// it. Either way the reasoning is stored on the request and shown to the trader,
// which is the whole point of reviewing it by hand.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = orderReviewSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: {
      id: true,
      userId: true,
      kind: true,
      fulfillment: true,
      sourceAccountId: true,
    },
  });
  if (!order) return fail('order_not_found', 404);
  // Purchases are not stage requests; there is nothing to judge.
  if (order.kind === 'PURCHASE') return fail('not_a_stage_request', 400);
  if (order.fulfillment === 'COMPLETED') return fail('already_completed', 409);

  const approved = parsed.data.decision === 'APPROVE';
  const now = new Date();

  await prisma.order.update({
    where: { id: order.id },
    data: {
      reviewStatus: approved ? 'APPROVED' : 'REJECTED',
      reviewNote: parsed.data.note,
      reviewedAt: now,
      // An approved request goes back into the queue to have the next account's
      // login entered against it. A refused one leaves the queue for good.
      fulfillment: approved ? 'REVIEW' : 'REJECTED',
    },
  });

  if (order.sourceAccountId) {
    if (approved) {
      // Marking the source PASSED is what stops it being traded on and what
      // the completion step looks for when it closes the old account out.
      await prisma.tradingAccount.updateMany({
        where: { id: order.sourceAccountId, status: { in: ['ACTIVE', 'PASSED'] } },
        data: { status: 'PASSED' },
      });
    } else if (parsed.data.failAccount) {
      // Refused because the account broke a rule. It is closed, and it carries
      // the same words the trader reads on the request — one explanation, not
      // two that can drift apart.
      const account = await prisma.tradingAccount.findUnique({
        where: { id: order.sourceAccountId },
        select: { accountNumber: true },
      });
      if (account) {
        await getTradingPlatform()
          .disableAccount(account.accountNumber)
          .catch(() => undefined);
      }
      await prisma.tradingAccount.updateMany({
        where: { id: order.sourceAccountId },
        data: {
          status: 'FAILED',
          breachRule: 'ADMIN_MANUAL',
          breachSource: 'ADMIN',
          breachNote: parsed.data.note,
          breachedAt: now,
          breachDetail: null,
        },
      });
    }
  }

  await audit('admin.order.review', session.sub, {
    orderId: order.id,
    decision: parsed.data.decision,
    failedAccount: !approved && parsed.data.failAccount,
    note: parsed.data.note,
  });

  return ok({
    orderId: order.id,
    reviewStatus: approved ? 'APPROVED' : 'REJECTED',
  });
}
