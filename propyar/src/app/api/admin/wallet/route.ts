import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ok, fail, audit } from '@/lib/api';
import { adminWalletSchema } from '@/lib/validation';
import { recordWallet } from '@/lib/wallet';

// Lets support credit or debit a trader's store credit. Recorded in the ledger
// with the reason, so an adjustment can always be traced back to who made it.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminWalletSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const result = await recordWallet({
    userId: parsed.data.userId,
    amount: parsed.data.amount,
    type: 'ADMIN',
    note: parsed.data.note || 'adjustment',
  });
  // A null result means the debit would have taken the balance below zero.
  if (!result) return fail('insufficient_balance', 400);

  await audit('admin.wallet.adjust', session.sub, {
    targetUserId: parsed.data.userId,
    amount: parsed.data.amount,
    note: parsed.data.note,
  });

  return ok({ balance: result.balance });
}
