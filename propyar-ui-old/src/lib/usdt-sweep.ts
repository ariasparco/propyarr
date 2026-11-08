import 'server-only';
import { prisma } from './prisma';
import {
  usdtConfigured,
  usdtExpectedAmount,
  usdtOrderTtlMinutes,
  usdtVerify,
} from './payments/usdt';
import { markPaidForReview } from './provision';

/**
 * Settles crypto orders in the background.
 *
 * Iranian exchanges commonly take 30–60 minutes to actually broadcast a USDT
 * transfer, so a customer cannot be expected to sit on the checkout page until
 * it lands. This runs on the server: the order is confirmed and the
 * confirmation email sent whether or not the browser is still open.
 */
export async function sweepPendingUsdtOrders(): Promise<{
  checked: number;
  settled: number;
  expired: number;
}> {
  if (!usdtConfigured()) return { checked: 0, settled: 0, expired: 0 };

  const ttlMs = usdtOrderTtlMinutes() * 60_000;
  const orders = await prisma.order.findMany({
    where: { paymentMethod: 'usdt', paymentStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  let settled = 0;
  let expired = 0;

  for (const order of orders) {
    const past = Date.now() - order.createdAt.getTime() > ttlMs;
    try {
      const lookup = await usdtVerify({
        expectedAmount: usdtExpectedAmount(order.amount, order.id),
        fromBlock: order.chainFromBlock,
        createdAt: order.createdAt,
      });

      if (lookup.status === 'FOUND') {
        try {
          await prisma.order.update({
            where: { id: order.id },
            data: { txHash: lookup.match.txHash },
          });
        } catch {
          continue; // another order already claimed this transfer
        }
        await markPaidForReview(order.id, lookup.match.txHash);
        settled += 1;
        continue;
      }

      // Close the order only after a successful read that found nothing — an
      // API outage must never cancel an order somebody actually paid for.
      if (lookup.status === 'NOT_FOUND' && past) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'FAILED' },
        });
        expired += 1;
      }
    } catch (err) {
      console.error('usdt sweep: order check failed', order.id, err);
    }

    // Stay well inside BscScan's free-tier rate limit.
    await new Promise((r) => setTimeout(r, 400));
  }

  return { checked: orders.length, settled, expired };
}
