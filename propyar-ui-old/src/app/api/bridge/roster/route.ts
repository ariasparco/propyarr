import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Tells the terminal agent which accounts to poll, and how to sign in to them.
 *
 * The credentials returned are the READ-ONLY (investor) passwords an admin
 * entered when handing the account over. They allow reading balance and trade
 * history but cannot place orders, so a leak could not move a customer's money.
 * The master password is never included.
 *
 * This is what removes the second list: the admin fills the account in once,
 * on the order, and the agent picks it up from here automatically.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.BRIDGE_SECRET;
  if (!secret) return fail('bridge_not_configured', 503);

  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ') || header.slice(7) !== secret)
    return fail('forbidden', 403);

  const accounts = await prisma.tradingAccount.findMany({
    where: { status: { in: ['ACTIVE', 'FUNDED'] } },
    select: {
      accountNumber: true,
      server: true,
      status: true,
      phase: true,
      investorPassword: true,
      snapshotAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return ok({
    accounts: accounts.map((a) => ({
      accountNumber: a.accountNumber,
      server: a.server,
      status: a.status,
      phase: a.phase,
      // Null when no read-only password was entered; the agent then skips it
      // unless its own config supplies one. An admin who leaves the field blank
      // stores an empty string, which must read as "not set" here too.
      password: a.investorPassword?.trim() ? a.investorPassword : null,
      lastSyncedAt: a.snapshotAt?.toISOString() ?? null,
    })),
  });
}
