import 'server-only';
import type { CheckoutInput, CheckoutResult } from '../payments';
import {
  currentBlock,
  isRpcUnavailable,
  tokenTransfersTo,
} from './bsc-rpc';

// USDT on BEP20 (Binance Smart Chain / BNB Chain).
// Strategy for a simple, low-cost setup without per-order wallets: use one
// receiving address and give each order a UNIQUE amount (base + tiny suffix) so
// incoming transfers can be matched to orders on-chain.
//
// The chain is read through public RPC nodes rather than a block explorer API:
// no key, no account, and nothing that can be withdrawn from under us.

const USDT_BEP20_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'; // 18 decimals on BSC

/** Confirmations required before a transfer is treated as settled. */
const MIN_CONFIRMATIONS = 6;

/** Fallback block estimate for orders created before the block was recorded. */
const BSC_BLOCK_SECONDS = 0.75;

export function usdtConfigured() {
  return Boolean(process.env.USDT_RECEIVE_ADDRESS);
}

/** Deterministic unique amount per order so we can match the on-chain transfer. */
export function usdtExpectedAmount(amountUsd: number, orderId: string): string {
  const suffix = ((parseInt(orderId.slice(-5), 36) % 9000) + 1) / 100000; // 0.00001 – 0.09000
  return (amountUsd + suffix).toFixed(5);
}

export async function usdtCreate(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const address = process.env.USDT_RECEIVE_ADDRESS as string;
  const amount = usdtExpectedAmount(input.amountUsd, input.orderId);

  // Recording where on the chain to start looking makes later verification
  // exact instead of guessing from elapsed time.
  let fromBlock: number | null = null;
  try {
    fromBlock = await currentBlock();
  } catch {
    /* verification falls back to a time estimate */
  }

  return {
    kind: 'crypto',
    address,
    amount,
    network: 'BEP20 (BNB Smart Chain)',
    reference: `usdt_${input.orderId}`,
    fromBlock,
  };
}

export type UsdtMatch = { txHash: string; from: string; amount: string };

/**
 * The outcome of a lookup. `NOT_FOUND` means the chain was read successfully and
 * no matching transfer exists — a real answer the customer can act on.
 * `UNAVAILABLE` means we could not read the chain at all, which must never be
 * shown as "no payment received".
 */
export type UsdtLookup =
  | { status: 'FOUND'; match: UsdtMatch }
  | { status: 'NOT_FOUND' }
  | { status: 'UNAVAILABLE' };

/**
 * Minutes an unpaid crypto order stays open. Generous by design: Iranian
 * exchanges routinely take 30–60 minutes to broadcast a withdrawal, so a short
 * window would expire orders that were paid on time.
 */
export function usdtOrderTtlMinutes(): number {
  const n = Number(process.env.USDT_ORDER_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 180;
}

/** Value of an expected amount in 18-decimal wei. */
function toWei(amount: string): bigint {
  return BigInt(Math.round(Number(amount) * 1e5)) * BigInt('10000000000000');
}

/**
 * Looks for a transfer to our address carrying this order's unique amount.
 *
 * Returns the transaction hash so the caller can bind it to the order — a hash
 * is only ever accepted once, so a shared or replayed transfer cannot settle a
 * second order.
 */
export async function usdtVerify(opts: {
  expectedAmount: string;
  fromBlock: number | null;
  createdAt: Date;
}): Promise<UsdtLookup> {
  const address = process.env.USDT_RECEIVE_ADDRESS as string;

  try {
    const head = await currentBlock();

    // Prefer the block recorded at checkout; otherwise estimate from age, with
    // a wide margin so a slow chain cannot push the payment out of range.
    const elapsed = (Date.now() - opts.createdAt.getTime()) / 1000;
    const estimated = head - Math.ceil((elapsed * 1.5) / BSC_BLOCK_SECONDS) - 200;
    const start = Math.max(0, opts.fromBlock ?? estimated);

    const logs = await tokenTransfersTo({
      contract: USDT_BEP20_CONTRACT,
      to: address,
      fromBlock: start,
      toBlock: head,
    });

    const expectedWei = toWei(opts.expectedAmount);
    for (const log of logs) {
      if (log.value !== expectedWei) continue;
      if (head - log.blockNumber < MIN_CONFIRMATIONS) continue; // still settling
      return {
        status: 'FOUND',
        match: {
          txHash: log.txHash,
          from: log.from,
          amount: opts.expectedAmount,
        },
      };
    }
    return { status: 'NOT_FOUND' };
  } catch (err) {
    if (isRpcUnavailable(err)) return { status: 'UNAVAILABLE' };
    console.error('usdt verify failed', err);
    return { status: 'UNAVAILABLE' };
  }
}
