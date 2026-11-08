import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setSession } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`login:${ip}`, 10, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return fail('invalid', 422);

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return fail('invalid', 401);

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    await audit('user.login.fail', user.id, { email }, ip);
    return fail('invalid', 401);
  }

  // Checked only after the password, so this cannot be used to enumerate which
  // addresses are registered.
  if (!user.emailVerified) return fail('not_verified', 403);

  await setSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await audit('user.login', user.id, undefined, ip);

  return ok({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
