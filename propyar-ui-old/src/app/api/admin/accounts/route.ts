import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { adminAccountActionSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';
import { getTradingPlatform } from '@/lib/trading';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminAccountActionSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const account = await prisma.tradingAccount.findUnique({
    where: { id: parsed.data.accountId },
  });
  if (!account) return fail('account_not_found', 404);

  let data: {
    status?: string;
    phase?: string;
    breachRule?: string;
    breachedAt?: Date;
    breachSource?: string;
  } = {};
  switch (parsed.data.action) {
    case 'DISABLE':
      await getTradingPlatform().disableAccount(account.accountNumber);
      data = { status: 'DISABLED' };
      break;
    case 'PASS':
      // Advance a two-step account: PHASE_1 -> PHASE_2, else -> FUNDED.
      data =
        account.phase === 'PHASE_1'
          ? { status: 'ACTIVE', phase: 'PHASE_2' }
          : { status: 'FUNDED', phase: 'FUNDED' };
      break;
    case 'FUND':
      data = { status: 'FUNDED', phase: 'FUNDED' };
      break;
    case 'FAIL':
      // Manual rule-breach override (fallback if the auto engine misses one).
      await getTradingPlatform().disableAccount(account.accountNumber);
      data = {
        status: 'FAILED',
        breachRule: 'ADMIN_MANUAL',
        breachedAt: new Date(),
        breachSource: 'ADMIN',
      };
      break;
  }

  const updated = await prisma.tradingAccount.update({
    where: { id: account.id },
    data,
  });

  await audit('admin.account', session.sub, {
    accountId: account.id,
    action: parsed.data.action,
  });

  return ok({
    account: { id: updated.id, status: updated.status, phase: updated.phase },
  });
}
