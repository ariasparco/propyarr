// Payment abstraction over the methods customers may pay with:
//
//   card    — card-to-card transfer arranged with support on Telegram. Nothing
//             is collected online, so the order stays PENDING until a member of
//             staff has seen the money and marks it paid.
//   usdt    — BEP20 transfer, verified on-chain.
//   paystar — IRR gateway. Off by default; opt in once the contract is live.
//
// Plus a sandbox fallback used until real credentials are configured.
import 'server-only';
import { paystarConfigured, paystarCreate } from './payments/paystar';
import { usdtConfigured, usdtCreate } from './payments/usdt';

export type PaymentMethod = 'card' | 'paystar' | 'usdt' | 'mock';

export type CheckoutInput = {
  orderId: string;
  amountUsd: number;
  description: string;
  callbackBaseUrl: string;
};

export type CheckoutResult =
  | { kind: 'paid'; reference: string }
  /**
   * Settled away from the site. The order is left unpaid on purpose: money that
   * has not been seen is not money received, and marking it otherwise would
   * hand out challenges for free.
   */
  | { kind: 'manual'; reference: string }
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
  if (process.env.PAYMENTS_CARD_ENABLED !== 'false') methods.push('card');
  // Opt-in rather than opt-out. It used to be the other way round, which meant
  // an unconfigured gateway fell through to the sandbox branch below and
  // settled real customer orders instantly, for nothing.
  if (process.env.PAYMENTS_IRR_ENABLED === 'true') methods.push('paystar');
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
  // Card-to-card is arranged with a person; there is nothing to call.
  if (method === 'card') return { kind: 'manual', reference: `card_${input.orderId}` };
  if (method === 'paystar' && paystarConfigured()) return paystarCreate(input);
  if (method === 'usdt' && usdtConfigured()) return usdtCreate(input);
  // Sandbox: no real credentials yet — settle instantly so the flow is testable.
  return { kind: 'paid', reference: `sandbox_${method}_${input.orderId}` };
}

export function isSandbox(method: PaymentMethod): boolean {
  if (method === 'card') return false;
  if (method === 'paystar') return !paystarConfigured();
  if (method === 'usdt') return !usdtConfigured();
  return true;
}
