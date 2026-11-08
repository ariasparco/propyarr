import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, rateLimit } from '@/lib/api';
import {
  usdtConfigured,
  usdtExpectedAmount,
  usdtOrderTtlMinutes,
  usdtVerify,
} from '@/lib/payments/usdt';
import { markPaidForReview } from '@/lib/provision';

/**
 * Polled by the checkout UI while the customer pays.
 *
 * Every reply is a definite answer the UI can act on:
 *   REVIEW      — payment confirmed, order queued for an admin
 *   NOT_FOUND   — chain read fine, no matching transfer yet
 *   UNAVAILABLE — could not read the chain; say so rather than imply no payment
 *   EXPIRED     — the payment window closed and the order was abandoned
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`usdtcheck:${session.sub}`, 40, 60_000))
    return fail('too_many_requests', 429);

  let orderId = '';
  try {
    orderId = String((await req.json()).orderId ?? '');
  } catch {
    return fail('invalid_body', 400);
  }
  if (!orderId) return fail('invalid', 422);

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: session.sub },
  });
  if (!order) return fail('not_found', 404);

  if (order.paymentStatus === 'PAID') return ok({ status: 'REVIEW' });
  if (order.paymentStatus === 'FAILED') return ok({ status: 'EXPIRED' });

  const ttlMs = usdtOrderTtlMinutes() * 60_000;
  const expiresAt = new Date(order.createdAt.getTime() + ttlMs);
  const secondsLeft = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  );

  // Sandbox (no wallet configured): nothing to read on-chain.
  if (!usdtConfigured()) return ok({ status: 'UNAVAILABLE', secondsLeft });

  const expected = usdtExpectedAmount(order.amount, order.id);
  const lookup = await usdtVerify({
    expectedAmount: expected,
    fromBlock: order.chainFromBlock,
    createdAt: order.createdAt,
  });

  if (lookup.status === 'UNAVAILABLE')
    return ok({ status: 'UNAVAILABLE', secondsLeft });

  if (lookup.status === 'NOT_FOUND') {
    // Only close the order once we have actually read the chain and found
    // nothing — a network outage must never expire someone's paid order.
    if (secondsLeft === 0) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED' },
      });
      return ok({ status: 'EXPIRED' });
    }
    return ok({ status: 'NOT_FOUND', secondsLeft, expected });
  }

  // Bind the transfer to this order. The unique index makes the write fail if
  // another order already claimed the same hash.
  try {
    await prisma.order.update({
      where: { id: order.id },
      data: { txHash: lookup.match.txHash },
    });
  } catch {
    return fail('tx_already_used', 409);
  }

  await markPaidForReview(order.id, lookup.match.txHash);
  return ok({ status: 'REVIEW' });
}
