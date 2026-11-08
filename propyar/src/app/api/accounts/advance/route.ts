import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { nextPhase } from '@/lib/plan-rules';
import { ok, fail, audit, rateLimit } from '@/lib/api';

// A trader asks to move to the next stage. The request lands in the admin
// orders queue, where a person reviews the account against the published rules,
// writes their decision, and — if it is approved — enters the next account's
// details.
//
// Deliberately open to accounts that are still ACTIVE. The panel's own verdict
// is informational while the engine is being reworked, so the trader decides
// when they believe they are done and staff decide whether they are right.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`advance:${session.sub}`, 10, 60_000))
    return fail('too_many_requests', 429);

  let accountId = '';
  try {
    accountId = String((await req.json()).accountId ?? '');
  } catch {
    return fail('invalid_body', 400);
  }
  if (!accountId) return fail('validation', 422);

  const account = await prisma.tradingAccount.findFirst({
    where: { id: accountId, userId: session.sub },
    include: { challenge: { select: { accountType: true } } },
  });
  if (!account) return fail('account_not_found', 404);
  if (account.status !== 'PASSED' && account.status !== 'ACTIVE')
    return fail('not_requestable', 400);

  // One-step goes from stage 1 straight to the main account; two-step has a
  // second stage in between; Direct Real has no next stage at all.
  const kind = nextPhase(account.challenge.accountType, account.phase);
  if (!kind) return fail('no_next_stage', 400);

  // Only a request that is still in the queue blocks a new one. A refused
  // request must not lock the trader out for good: "not there yet, keep
  // trading" is a normal answer, and they have to be able to come back.
  const pending = await prisma.order.findFirst({
    where: { sourceAccountId: account.id, fulfillment: 'REVIEW' },
  });
  if (pending) return ok({ status: 'REVIEW', orderId: pending.id });

  // Follow-on accounts are free — the challenge fee was paid up front.
  const order = await prisma.order.create({
    data: {
      userId: session.sub,
      challengeId: account.challengeId,
      amount: 0,
      currency: 'USD',
      paymentStatus: 'PAID',
      paymentMethod: 'none',
      fulfillment: 'REVIEW',
      kind,
      sourceAccountId: account.id,
    },
  });

  await audit('account.advance.request', session.sub, {
    accountId: account.id,
    kind,
    orderId: order.id,
  });

  return ok({ status: 'REVIEW', orderId: order.id, kind });
}
