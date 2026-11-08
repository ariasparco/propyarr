import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { orderSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';
import { createCheckout, isSandbox, isMethodEnabled } from '@/lib/payments';
import { quote, consumeDiscount } from '@/lib/pricing';
import { recordWallet } from '@/lib/wallet';
import { markPaidForReview } from '@/lib/provision';
import { SITE } from '@/lib/constants';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    include: { challenge: true, tradingAccount: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok({ orders });
}

// Abandons an unpaid order so it stops occupying the checkout.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);

  let orderId = '';
  try {
    orderId = String((await req.json()).orderId ?? '');
  } catch {
    return fail('invalid_body', 400);
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: session.sub, paymentStatus: 'PENDING' },
  });
  if (!order) return fail('not_cancellable', 409);

  const cancelled = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: 'PENDING' },
    data: { paymentStatus: 'FAILED' },
  });
  if (cancelled.count === 0) return fail('not_cancellable', 409);

  // Give back any store credit the abandoned order was holding.
  if (order.walletAmount > 0) {
    await recordWallet({
      userId: session.sub,
      amount: order.walletAmount,
      type: 'REFUND',
      note: 'order cancelled',
      orderId: order.id,
    });
  }

  await audit('order.cancel', session.sub, { orderId });
  return ok({ cancelled: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  const ip = clientIp(req);
  if (!rateLimit(`order:${session.sub}`, 10, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const challenge = await prisma.challenge.findFirst({
    where: { id: parsed.data.challengeId, active: true, comingSoon: false },
  });
  if (!challenge) return fail('challenge_not_found', 404);

  const method = parsed.data.paymentMethod;
  if (!isMethodEnabled(method)) return fail('method_disabled', 400);

  // 1) Price it: discount first, then store credit against what remains.
  const priced = await quote({
    userId: session.sub,
    challengeId: challenge.id,
    listPrice: challenge.price,
    code: parsed.data.discountCode,
    useWallet: parsed.data.useWallet ?? false,
  });
  if (parsed.data.discountCode && priced.discountProblem)
    return fail(`discount_${priced.discountProblem.toLowerCase()}`, 400);

  // 2) Create the pending order at the price actually owed.
  const order = await prisma.order.create({
    data: {
      userId: session.sub,
      challengeId: challenge.id,
      amount: priced.dueNow,
      listPrice: priced.listPrice,
      discountCode: priced.discountCode,
      discountAmount: priced.discountAmount,
      walletAmount: priced.walletApplied,
      currency: 'USD',
      paymentStatus: 'PENDING',
      paymentMethod: method,
    },
  });

  if (priced.discountCode) await consumeDiscount(priced.discountCode);

  // Take the store credit now so it cannot be spent twice on parallel orders.
  if (priced.walletApplied > 0) {
    const moved = await recordWallet({
      userId: session.sub,
      amount: -priced.walletApplied,
      type: 'PURCHASE',
      note: `${challenge.accountType} ${challenge.name}`,
      orderId: order.id,
    });
    if (!moved) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED' },
      });
      return fail('insufficient_wallet', 400);
    }
  }

  // Credit covered the whole price — nothing left to collect.
  if (priced.dueNow <= 0) {
    await markPaidForReview(order.id, `wallet_${order.id}`);
    await audit('order.paid', session.sub, { orderId: order.id, method: 'wallet' }, ip);
    return ok({ status: 'REVIEW', orderId: order.id });
  }

  // 3) Start checkout with the chosen provider.
  const origin = req.nextUrl.origin || SITE.url;
  const checkout = await createCheckout(method, {
    orderId: order.id,
    amountUsd: priced.dueNow,
    description: `${challenge.accountType} ${challenge.name}`,
    callbackBaseUrl: origin,
  });

  if (checkout.kind !== 'paid') {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentRef: checkout.reference,
        amountRial: checkout.kind === 'redirect' ? checkout.amountRial : null,
        chainFromBlock: checkout.kind === 'crypto' ? checkout.fromBlock : null,
      },
    });
  }

  // 3) Respond per checkout type.
  if (checkout.kind === 'redirect') {
    return ok({ status: 'REDIRECT', orderId: order.id, redirectUrl: checkout.url });
  }
  if (checkout.kind === 'crypto') {
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

  // Sandbox / instant settlement → mark paid & send to manual review.
  await markPaidForReview(order.id, checkout.reference);
  await audit(
    'order.paid',
    session.sub,
    { orderId: order.id, method, sandbox: isSandbox(method) },
    ip,
  );
  return ok({ status: 'REVIEW', orderId: order.id });
}
