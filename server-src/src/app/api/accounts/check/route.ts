import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ok, fail, rateLimit } from '@/lib/api';
import { runAccountCheck } from '@/lib/monitor-run';
import { triggerBotSync } from '@/lib/monitor-source';

// On-demand rule check the trader can run from their dashboard.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`check:${session.sub}`, 20, 60_000))
    return fail('too_many_requests', 429);

  let accountId = '';
  let shouldSync = false;
  try {
    const body = await req.json();
    accountId = String(body.accountId ?? '');
    shouldSync = Boolean(body.sync);
  } catch {
    return fail('invalid_body', 400);
  }
  if (!accountId) return fail('validation', 422);

  const isAdmin = session.role === 'ADMIN';

  if (shouldSync) {
    const account = await prisma.tradingAccount.findFirst({
      where: isAdmin ? { id: accountId } : { id: accountId, userId: session.sub },
      select: {
        accountNumber: true,
        server: true,
        password: true,
        investorPassword: true,
      },
    });
    if (account) {
      await triggerBotSync(account).catch(() => null);
    }
  }

  const report = await runAccountCheck(accountId, {
    ...(isAdmin ? {} : { userId: session.sub }),
    forceHistory: true,
  });
  if (!report) return fail('account_not_found', 404);

  return ok({ report });
}
