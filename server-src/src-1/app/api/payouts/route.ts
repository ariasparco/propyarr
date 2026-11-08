import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { payoutSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit } from '@/lib/api';
import { evaluatePayout } from '@/lib/payout-rules';
import { email as mailer } from '@/lib/email';
import { formatCurrency } from '@/lib/format';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  const payouts = await prisma.payout.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { accountNumber: true } } },
  });
  return ok({ payouts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`payout:${session.sub}`, 5, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = payoutSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const [account, user, pending] = await Promise.all([
    prisma.tradingAccount.findFirst({
      where: { id: parsed.data.accountId, userId: session.sub },
      include: { challenge: { select: { profitSplit: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { email: true, kycStatus: true },
    }),
    prisma.payout.count({
      where: {
        accountId: parsed.data.accountId,
        status: { in: ['REQUESTED', 'APPROVED'] },
      },
    }),
  ]);
  if (!account || !user) return fail('account_not_found', 404);

  const eligibility = evaluatePayout({
    status: account.status,
    equity: account.equity,
    startingBalance: account.startingBalance,
    profitSplit: account.challenge.profitSplit,
    fundedAt: account.fundedAt,
    kycStatus: user.kycStatus,
    hasPendingRequest: pending > 0,
  });
  if (!eligibility.eligible)
    return fail(eligibility.block ?? 'not_eligible', 400);

  if (parsed.data.amount < eligibility.minAmount)
    return fail('below_minimum', 400);
  if (parsed.data.amount > eligibility.available)
    return fail('amount_exceeds_profit', 400);

  const payout = await prisma.payout.create({
    data: {
      userId: session.sub,
      accountId: account.id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      wallet: parsed.data.wallet,
      status: 'REQUESTED',
    },
  });

  await audit('payout.request', session.sub, {
    payoutId: payout.id,
    amount: payout.amount,
  });
  await mailer.payoutRequested(
    user.email,
    formatCurrency(payout.amount, 'fa'),
  );

  return ok({ payout: { id: payout.id, status: payout.status } });
}
