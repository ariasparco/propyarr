import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ok, fail, rateLimit } from '@/lib/api';
import { runAccountCheck } from '@/lib/monitor-run';
import { triggerBotSync } from '@/lib/monitor-source';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// On-demand live extraction and rule evaluation endpoint
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`sync:${session.sub}`, 15, 60_000))
    return fail('too_many_requests', 429);

  let accountId = '';
  try {
    const body = await req.json();
    accountId = String(body.accountId ?? '');
  } catch {
    return fail('invalid_body', 400);
  }
  if (!accountId) return fail('validation', 422);

  const isAdmin = session.role === 'ADMIN';
  const account = await prisma.tradingAccount.findFirst({
    where: isAdmin ? { id: accountId } : { id: accountId, userId: session.sub },
    select: {
      id: true,
      accountNumber: true,
      server: true,
      password: true,
      investorPassword: true,
      status: true,
    },
  });

  if (!account) return fail('account_not_found', 404);

  // 1. Attempt live extraction via Bot
  const botSnapshot = await triggerBotSync({
    accountNumber: account.accountNumber,
    server: account.server,
    password: account.password,
    investorPassword: account.investorPassword,
  });

  // 2. Evaluate all prop firm rules against fresh state
  const report = await runAccountCheck(
    account.id,
    isAdmin ? {} : { userId: session.sub },
  );

  return ok({
    synced: Boolean(botSnapshot),
    source: botSnapshot ? 'bot_live' : 'stored',
    report,
    lastSyncedAt: new Date().toISOString(),
  });
}
