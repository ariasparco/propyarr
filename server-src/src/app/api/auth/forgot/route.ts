import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forgotSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';
import { createCode, VERIFICATION_TTL_MINUTES } from '@/lib/verification';
import { email as mailer } from '@/lib/email';

// Sends a six-digit reset code. The reply is identical whether or not the
// address is registered, so it cannot be used to discover who has an account.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`forgot:${ip}`, 5, 60_000))
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

  if (user) {
    const code = await createCode(user.id, 'RESET');
    await mailer.passwordResetCode(
      user.email,
      user.name,
      code,
      VERIFICATION_TTL_MINUTES,
    );
    await audit('auth.reset.request', user.id, undefined, ip);
  }

  return ok({ sent: true });
}
