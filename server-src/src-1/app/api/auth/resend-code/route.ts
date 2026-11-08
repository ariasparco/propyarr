import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forgotSchema } from '@/lib/validation';
import { ok, fail, rateLimit, clientIp } from '@/lib/api';
import {
  createVerificationCode,
  VERIFICATION_TTL_MINUTES,
} from '@/lib/verification';
import { email as mailer } from '@/lib/email';

// Issues a fresh signup code. Answers identically whether or not the address is
// waiting on verification, so it cannot be used to discover who has an account.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`resend:${ip}`, 4, 120_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = forgotSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (user && !user.emailVerified) {
    const code = await createVerificationCode(user.id);
    await mailer.verifyCode(
      user.email,
      user.name,
      code,
      VERIFICATION_TTL_MINUTES,
    );
  }

  return ok({ sent: true });
}
