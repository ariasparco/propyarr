import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, audit } from '@/lib/api';

// Only public myfxbook.com pages, so the panel never links somewhere else.
const schema = z.object({
  accountId: z.string().min(1),
  url: z
    .string()
    .trim()
    .max(300)
    .refine((u) => u === '' || /^https:\/\/(www\.)?myfxbook\.com\//i.test(u)),
});

// The account owner links (or clears) the account's public Myfxbook page.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const updated = await prisma.tradingAccount.updateMany({
    where: { id: parsed.data.accountId, userId: session.sub },
    data: { myfxbookUrl: parsed.data.url || null },
  });
  if (updated.count === 0) return fail('account_not_found', 404);

  await audit('account.myfxbook', session.sub, { accountId: parsed.data.accountId });
  return ok({ url: parsed.data.url || null });
}
