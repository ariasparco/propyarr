import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { profileSchema } from '@/lib/validation';
import { ok, fail, rateLimit } from '@/lib/api';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`profile:${session.sub}`, 20, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  await prisma.user.update({
    where: { id: session.sub },
    data: { phone: parsed.data.phone },
  });
  return ok({ phone: parsed.data.phone });
}
