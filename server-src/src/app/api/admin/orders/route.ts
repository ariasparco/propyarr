import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { completeOrderSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';
import { email as mailer } from '@/lib/email';
import { issueCertificate } from '@/lib/certificate-issue';

// Admin completes an order by entering the MT5 account credentials they created
// manually. Handles both paid purchases and free follow-on stage accounts.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = completeOrderSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { challenge: true, tradingAccount: true, user: true },
  });
  if (!order) return fail('order_not_found', 404);
  if (order.tradingAccount) return fail('already_completed', 409);
  if (order.paymentStatus !== 'PAID') return fail('not_paid', 400);
  // A wallet top-up has no plan, so there is no account to hand over.
  if (!order.challengeId || !order.challenge)
    return fail('not_a_challenge_order', 400);

  const isInstant = order.challenge.accountType === 'INSTANT';
  const phase =
    order.kind === 'FUNDED' || isInstant
      ? 'FUNDED'
      : order.kind === 'PHASE_2'
        ? 'PHASE_2'
        : 'PHASE_1';
  const status = phase === 'FUNDED' ? 'FUNDED' : 'ACTIVE';

  try {
    const account = await prisma.tradingAccount.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        challengeId: order.challengeId,
        accountNumber: parsed.data.accountNumber,
        platform: parsed.data.platform || 'MT5',
        server: parsed.data.server,
        password: parsed.data.password,
        investorPassword: parsed.data.investorPassword || null,
        metaApiId: parsed.data.metaApiId || null,
        startingBalance: order.challenge.virtualCapital,
        balance: order.challenge.virtualCapital,
        equity: order.challenge.virtualCapital,
        status,
        phase,
        fundedAt: phase === 'FUNDED' ? new Date() : null,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { fulfillment: 'COMPLETED' },
    });

    // Close out the account this stage came from so it is not double-counted.
    if (order.sourceAccountId) {
      await prisma.tradingAccount.updateMany({
        where: { id: order.sourceAccountId, status: 'PASSED' },
        data: { status: 'DISABLED' },
      });
    }

    // Reaching a funded account is itself an achievement worth certifying.
    if (phase === 'FUNDED') {
      await issueCertificate(account.id, 'FUNDED', { notify: false });
    }

    await audit('admin.order.complete', session.sub, {
      orderId: order.id,
      accountNumber: account.accountNumber,
      phase,
    });
    // The trader gets the full login in the email as well as on the dashboard,
    // so they can start without hunting for it.
    await mailer.accountReady(order.user.email, {
      accountNumber: account.accountNumber,
      server: account.server,
      password: account.password ?? '',
      platform: account.platform,
    });

    return ok({ accountNumber: account.accountNumber });
  } catch {
    // Most likely a duplicate account number.
    return fail('account_number_taken', 409);
  }
}
