import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, rateLimit } from '@/lib/api';
import { quoteSchema } from '@/lib/validation';
import { quote } from '@/lib/pricing';

// Prices a checkout before the order exists, so the customer sees the discount
// and credit applied before committing. Uses the same maths as the order route.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`quote:${session.sub}`, 40, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const challenge = await prisma.challenge.findFirst({
    where: { id: parsed.data.challengeId, active: true, comingSoon: false },
    select: { id: true, price: true },
  });
  if (!challenge) return fail('challenge_not_found', 404);

  const priced = await quote({
    userId: session.sub,
    challengeId: challenge.id,
    listPrice: challenge.price,
    code: parsed.data.discountCode,
    useWallet: parsed.data.useWallet ?? false,
  });

  return ok(priced);
}
