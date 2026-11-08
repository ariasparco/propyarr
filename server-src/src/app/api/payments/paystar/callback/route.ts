import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paystarVerify } from '@/lib/payments/paystar';
import { usdToRial } from '@/lib/fx';
import { markPaidForReview } from '@/lib/provision';
import { path } from '@/lib/routes';
import { defaultLocale } from '@/i18n/config';

async function handle(req: NextRequest) {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (params[k] = v));

  if (req.method === 'POST') {
    try {
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('form')) {
        const fd = await req.formData();
        fd.forEach((v, k) => (params[k] = String(v)));
      } else if (ct.includes('json')) {
        Object.assign(params, await req.json().catch(() => ({})));
      }
    } catch {
      /* ignore */
    }
  }

  const origin = req.nextUrl.origin;
  const okUrl = `${origin}${path(defaultLocale, '/dashboard/accounts')}?payment=success`;
  const failUrl = `${origin}${path(defaultLocale, '/dashboard/buy')}?payment=failed`;

  const orderId = params.order_id;
  if (!orderId || params.status !== '1')
    return NextResponse.redirect(failUrl);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus === 'FAILED')
    return NextResponse.redirect(failUrl);
  if (order.paymentStatus === 'PAID')
    return NextResponse.redirect(okUrl);

  const verified = await paystarVerify({
    refNum: params.ref_num,
    amountRial: order.amountRial ?? (await usdToRial(order.amount)),
    cardNumber: params.card_number,
    trackingCode: params.tracking_code,
  });
  if (!verified) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'FAILED' },
    });
    return NextResponse.redirect(failUrl);
  }

  await markPaidForReview(order.id, params.ref_num);
  return NextResponse.redirect(okUrl);
}

export const GET = handle;
export const POST = handle;
