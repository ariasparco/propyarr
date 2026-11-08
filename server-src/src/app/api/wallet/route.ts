import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ok, fail, rateLimit, audit } from '@/lib/api';
import { walletTopupSchema } from '@/lib/validation';
import { getWallet } from '@/lib/wallet';
import { createCheckout, isMethodEnabled } from '@/lib/payments';
import { SITE } from '@/lib/constants';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  return ok(await getWallet(session.sub));
}

/**
 * Starts a top-up. The credit is only added once the transfer is confirmed on
 * chain, which the same sweep that settles challenge orders takes care of.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`topup:${session.sub}`, 10, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = walletTopupSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);
  if (!isMethodEnabled('usdt')) return fail('method_disabled', 400);

  // A top-up buys credit, not a plan, so it carries no challenge at all.
  const order = await prisma.order.create({
    data: {
      userId: session.sub,
      amount: parsed.data.amount,
      listPrice: parsed.data.amount,
      currency: 'USD',
      paymentStatus: 'PENDING',
      paymentMethod: 'usdt',
      kind: 'TOPUP',
    },
  });

  const checkout = await createCheckout('usdt', {
    orderId: order.id,
    amountUsd: parsed.data.amount,
    description: 'Wallet top-up',
    callbackBaseUrl: req.nextUrl.origin || SITE.url,
  });

  if (checkout.kind !== 'crypto') {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'FAILED' },
    });
    return fail('unavailable', 503);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentRef: checkout.reference,
      chainFromBlock: checkout.fromBlock,
    },
  });
  await audit('wallet.topup.start', session.sub, {
    orderId: order.id,
    amount: parsed.data.amount,
  });

  return ok({
    status: 'CRYPTO',
    orderId: order.id,
    crypto: {
      address: checkout.address,
      amount: checkout.amount,
      network: checkout.network,
    },
  });
}
