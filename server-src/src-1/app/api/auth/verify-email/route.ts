import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSession } from '@/lib/auth';
import { verifyEmailSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';
import { confirmVerificationCode } from '@/lib/verification';
import { email as mailer } from '@/lib/email';

// Confirms the signup code and signs the trader in.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`verify:${ip}`, 15, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) return fail('bad_code', 422);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user) return fail('bad_code', 400);
  if (user.emailVerified) return fail('already_verified', 409);

  const result = await confirmVerificationCode(user.id, parsed.data.code);
  if (result !== 'OK') {
    const status = result === 'TOO_MANY_ATTEMPTS' ? 429 : 400;
    return fail(result.toLowerCase(), status);
  }

  await setSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await audit('user.verified', user.id, undefined, ip);
  await mailer.welcome(user.email, user.name);

  return ok({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
