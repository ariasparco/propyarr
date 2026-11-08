import 'server-only';
import { prisma } from './prisma';
import { getTradingPlatform } from './trading';
import { audit } from './api';
import { email as mailer } from './email';
import { payReferralCommission, recordWallet } from './wallet';

/**
 * Payment confirmed → mark the order PAID and put it into manual REVIEW so an
 * admin can create the demo account and enter its credentials. Idempotent.
 */
export async function markPaidForReview(orderId: string, paymentRef?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true } },
      challenge: { select: { name: true, accountType: true } },
    },
  });
  if (!order) return null;
  if (order.paymentStatus === 'PAID') return order;

  // A wallet top-up buys credit, not a challenge — it never enters the admin
  // fulfilment queue.
  if (order.kind === 'TOPUP') {
    const settled = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PAID',
        fulfillment: 'COMPLETED',
        ...(paymentRef ? { paymentRef } : {}),
      },
    });
    await recordWallet({
      userId: order.userId,
      amount: order.amount,
      type: 'TOPUP',
      note: 'USDT',
      orderId: order.id,
    });
    await audit('wallet.topup.settled', order.userId, {
      orderId: order.id,
      amount: order.amount,
    });
    await mailer.walletToppedUp(order.user.email, order.amount);
    return settled;
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: 'PAID',
      fulfillment: 'REVIEW',
      ...(paymentRef ? { paymentRef } : {}),
    },
  });
  await audit('order.paid', order.userId, { orderId: order.id });
  // Whoever referred this trader earns their share once the money is real.
  await payReferralCommission(order.id);
  if (order.challenge) {
    await mailer.orderReceived(
      order.user.email,
      `${order.challenge.accountType} ${order.challenge.name}`,
    );
  }
  return updated;
}

/**
 * Marks an order PAID and provisions its trading account. Safe to call more than
 * once (idempotent) — returns the existing account if already provisioned.
 */
export async function markPaidAndProvision(
  orderId: string,
  paymentRef?: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { challenge: true, tradingAccount: true },
  });
  if (!order) return null;
  if (order.tradingAccount) return order.tradingAccount; // already done
  // No plan means nothing to provision — a wallet top-up reaches this only by
  // mistake, and must never create a trading account.
  if (!order.challengeId || !order.challenge) return null;

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: 'PAID', ...(paymentRef ? { paymentRef } : {}) },
  });

  const platform = getTradingPlatform();
  const provisioned = await platform.createAccount({
    userId: order.userId,
    startingBalance: order.challenge.virtualCapital,
    leverage: order.challenge.leverage,
    platform: 'MT5',
  });

  const isInstant = order.challenge.accountType === 'INSTANT';
  const account = await prisma.tradingAccount.create({
    data: {
      userId: order.userId,
      orderId: order.id,
      challengeId: order.challengeId,
      accountNumber: provisioned.accountNumber,
      platform: 'MT5',
      server: provisioned.server,
      startingBalance: order.challenge.virtualCapital,
      balance: order.challenge.virtualCapital,
      equity: order.challenge.virtualCapital,
      status: isInstant ? 'FUNDED' : 'ACTIVE',
      phase: isInstant ? 'FUNDED' : 'PHASE_1',
    },
  });

  await audit('order.paid', order.userId, {
    orderId: order.id,
    accountNumber: account.accountNumber,
  });
  return account;
}
