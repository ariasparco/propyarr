import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { payoutSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit } from '@/lib/api';
import { evaluatePayout } from '@/lib/payout-rules';
import { loadMonitorSettings } from '@/lib/data';
import { voidedProfit } from '@/lib/monitor';
import { email as mailer } from '@/lib/email';
import { formatCurrency } from '@/lib/format';

/** How many positions the last terminal snapshot reported as running. */
function countOpenPositions(raw: string | null): number {
  if (!raw) return 0;
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

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
      include: { challenge: { select: { profitSplit: true } }, trades: true },
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

  // Same inputs the dashboard is shown, so the form can never offer an amount
  // this endpoint would refuse — and, more importantly, so profit the rule
  // engine voided is not quietly paid out here.
  const settings = await loadMonitorSettings();
  const openPositions = countOpenPositions(account.openPositions);
  const eligibility = evaluatePayout({
    status: account.status,
    balance: account.balance,
    equity: account.equity,
    startingBalance: account.startingBalance,
    profitSplit: account.challenge.profitSplit,
    fundedAt: account.fundedAt,
    kycStatus: user.kycStatus,
    hasPendingRequest: pending > 0,
    voidedProfit: voidedProfit(
      account.trades.map((t) => ({
        symbol: t.symbol,
        profit: t.profit,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      settings.minHoldSeconds,
    ),
    openPositions,
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
