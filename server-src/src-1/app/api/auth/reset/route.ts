import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { resetSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';
import { confirmCode } from '@/lib/verification';

// Confirms the reset code and sets the new password in one step, so a valid
// code is never left usable after it has been checked.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`reset:${ip}`, 15, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path.includes('password'));
    return fail(weak ? 'weak' : 'bad_code', 422);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user) return fail('invalid', 400);

  const result = await confirmCode(user.id, 'RESET', parsed.data.code);
  if (result !== 'OK') {
    const status = result === 'TOO_MANY_ATTEMPTS' ? 429 : 400;
    return fail(result.toLowerCase(), status);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      // Recovering by email proves the address works.
      emailVerified: user.emailVerified ?? new Date(),
    },
  });
  await audit('auth.reset.complete', user.id, undefined, ip);

  return ok({ reset: true });
}
