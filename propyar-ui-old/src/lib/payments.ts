// Payment abstraction supporting two live methods — PayStar (IRR) and USDT
// (BEP20) — plus a sandbox fallback used until real credentials are configured.
import 'server-only';
import { paystarConfigured, paystarCreate } from './payments/paystar';
import { usdtConfigured, usdtCreate } from './payments/usdt';

export type PaymentMethod = 'paystar' | 'usdt' | 'mock';

export type CheckoutInput = {
  orderId: string;
  amountUsd: number;
  description: string;
  callbackBaseUrl: string;
};

export type CheckoutResult =
  | { kind: 'paid'; reference: string }
  | { kind: 'redirect'; url: string; reference: string; amountRial: number }
  | {
      kind: 'crypto';
      address: string;
      amount: string;
      network: string;
      reference: string;
      /** Chain height at issue time; null if the node could not be reached. */
      fromBlock: number | null;
    };

/**
 * Which methods customers may choose. A method can be switched off from the
 * environment without touching code — used while the Rial gateway contract is
 * still being finalised.
 */
export function enabledMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  if (process.env.PAYMENTS_IRR_ENABLED !== 'false') methods.push('paystar');
  if (process.env.PAYMENTS_USDT_ENABLED !== 'false') methods.push('usdt');
  return methods;
}

export function isMethodEnabled(method: PaymentMethod): boolean {
  return enabledMethods().includes(method);
}

export async function createCheckout(
  method: PaymentMethod,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (method === 'paystar' && paystarConfigured()) return paystarCreate(input);
  if (method === 'usdt' && usdtConfigured()) return usdtCreate(input);
  // Sandbox: no real credentials yet — settle instantly so the flow is testable.
  return { kind: 'paid', reference: `sandbox_${method}_${input.orderId}` };
}

export function isSandbox(method: PaymentMethod): boolean {
  if (method === 'paystar') return !paystarConfigured();
  if (method === 'usdt') return !usdtConfigured();
  return true;
}
