import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { adminPayoutActionSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';
import { email as mailer } from '@/lib/email';
import { formatCurrency } from '@/lib/format';

const STATUS_FA: Record<string, string> = {
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
  PAID: 'پرداخت‌شده',
};

const nextStatus: Record<string, string> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  MARK_PAID: 'PAID',
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminPayoutActionSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const status = nextStatus[parsed.data.action];
  const payout = await prisma.payout.update({
    where: { id: parsed.data.payoutId },
    data: {
      status,
      processedAt: status === 'PAID' ? new Date() : undefined,
      ...(status === 'PAID'
        ? { txHash: parsed.data.txHash, network: parsed.data.network ?? 'BEP20' }
        : {}),
    },
    include: { user: { select: { email: true } } },
  });

  await audit('admin.payout', session.sub, {
    payoutId: payout.id,
    action: parsed.data.action,
  });
  await mailer.payoutStatus(
    payout.user.email,
    formatCurrency(payout.amount, 'fa'),
    STATUS_FA[status] ?? status,
  );

  return ok({ payout: { id: payout.id, status: payout.status } });
}
