import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, audit, rateLimit } from '@/lib/api';

// A trader who passed a stage requests the next account. The request lands in
// the admin orders queue, where staff create the account and enter its details.
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
  });
  if (!account) return fail('account_not_found', 404);
  if (account.status !== 'PASSED') return fail('not_passed', 400);

  const kind =
    account.phase === 'PHASE_1'
      ? 'PHASE_2'
      : account.phase === 'PHASE_2'
        ? 'FUNDED'
        : null;
  if (!kind) return fail('no_next_stage', 400);

  const pending = await prisma.order.findFirst({
    where: { sourceAccountId: account.id, fulfillment: { not: 'COMPLETED' } },
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
