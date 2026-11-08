import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, audit } from '@/lib/api';
import { markPaidForReview } from '@/lib/provision';

// Confirms that money arrived for an order settled away from the site.
//
// Card-to-card transfers are agreed with support on Telegram, so nothing tells
// the platform the money landed — a person has to say so. Until they do the
// order stays PENDING, which is the point: an unconfirmed transfer must never
// put an account in the fulfilment queue.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let orderId = '';
  let reference = '';
  try {
    const body = await req.json();
    orderId = String(body.orderId ?? '');
    reference = String(body.reference ?? '').trim().slice(0, 120);
  } catch {
    return fail('invalid_body', 400);
  }
  if (!orderId) return fail('validation', 422);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, paymentStatus: true, paymentMethod: true },
  });
  if (!order) return fail('order_not_found', 404);
  if (order.paymentStatus === 'PAID') return fail('already_paid', 409);

  // Routed through the same helper the gateways use, so a manually confirmed
  // order lands in the fulfilment queue exactly like a gateway-settled one —
  // wallet credit, referral share and the customer's email all included.
  const settled = await markPaidForReview(
    order.id,
    reference || `manual_${session.sub.slice(-6)}_${Date.now()}`,
  );
  if (!settled) return fail('order_not_found', 404);

  await audit('admin.order.settle', session.sub, {
    orderId: order.id,
    method: order.paymentMethod,
    reference: reference || null,
  });

  return ok({ orderId: order.id, paymentStatus: 'PAID' });
}
