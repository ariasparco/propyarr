import 'server-only';
import crypto from 'crypto';
import type { CheckoutInput, CheckoutResult } from '../payments';
import { usdToRial } from '../fx';

// PayStar (پی‌استار) IRR gateway — https://paystar.ir
// Flow: create → redirect user to gateway → callback → verify.
// NOTE: confirm the exact `sign` payload order against your PayStar panel/docs;
// the structure below follows PayStar's documented HMAC-SHA512 scheme.

const BASE = 'https://api.paystar.ir/api/pardakht';

function sign(payload: string, key: string) {
  return crypto.createHmac('sha512', key).update(payload).digest('hex');
}

export function paystarConfigured() {
  return Boolean(process.env.PAYSTAR_GATEWAY_ID && process.env.PAYSTAR_SIGN_KEY);
}

export async function paystarCreate(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const gatewayId = process.env.PAYSTAR_GATEWAY_ID as string;
  const key = process.env.PAYSTAR_SIGN_KEY as string;
  const amount = await usdToRial(input.amountUsd); // Rial
  const callback = `${input.callbackBaseUrl}/api/payments/paystar/callback`;

  const s = sign(`${amount}#${input.orderId}#${callback}`, key);
  const res = await fetch(`${BASE}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${gatewayId}`,
    },
    body: JSON.stringify({
      amount,
      order_id: input.orderId,
      callback,
      sign: s,
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | { status?: number; data?: { token?: string; ref_num?: string } }
    | null;

  const token = data?.data?.token;
  if (!token) {
    throw new Error(`paystar_create_failed: ${JSON.stringify(data)}`);
  }
  return {
    kind: 'redirect',
    url: `${BASE}/payment?token=${token}`,
    reference: String(data?.data?.ref_num ?? token),
    amountRial: amount,
  };
}

export async function paystarVerify(params: {
  refNum: string;
  amountRial: number;
  cardNumber?: string;
  trackingCode?: string;
}): Promise<boolean> {
  const gatewayId = process.env.PAYSTAR_GATEWAY_ID as string;
  const key = process.env.PAYSTAR_SIGN_KEY as string;
  const s = sign(
    `${params.amountRial}#${params.refNum}#${params.cardNumber ?? ''}#${params.trackingCode ?? ''}`,
    key,
  );
  const res = await fetch(`${BASE}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${gatewayId}`,
    },
    body: JSON.stringify({
      ref_num: params.refNum,
      amount: params.amountRial,
      sign: s,
    }),
  });
  const data = (await res.json().catch(() => null)) as { status?: number } | null;
  return data?.status === 1;
}
