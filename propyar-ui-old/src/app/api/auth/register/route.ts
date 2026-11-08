import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';
import { email as mailer } from '@/lib/email';
import {
  createVerificationCode,
  VERIFICATION_TTL_MINUTES,
} from '@/lib/verification';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 20, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path.includes('password'));
    return fail(weak ? 'weak' : 'generic', 422);
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  // A friend's code, resolved now because it can only ever be set at signup.
  let referredById: string | null = null;
  const inviteCode = parsed.data.referralCode?.trim().toUpperCase();
  if (inviteCode) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: inviteCode },
      select: { id: true },
    });
    // An unknown code is ignored rather than blocking the signup.
    if (referrer && referrer.id !== existing?.id) referredById = referrer.id;
  }

  // An unverified signup that was never completed can be claimed again, so a
  // mistyped code or a closed tab does not lock the address forever.
  if (existing && existing.emailVerified) return fail('exists', 409);

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          passwordHash: await hashPassword(parsed.data.password),
          // Only fill it if the abandoned signup never had one.
          ...(existing.referredById ? {} : { referredById }),
        },
      })
    : await prisma.user.create({
        data: {
          name: parsed.data.name,
          email,
          phone: parsed.data.phone,
          passwordHash: await hashPassword(parsed.data.password),
          referredById,
        },
      });

  // No session yet — the account is not usable until the code is confirmed.
  const code = await createVerificationCode(user.id);
  await mailer.verifyCode(
    user.email,
    user.name,
    code,
    VERIFICATION_TTL_MINUTES,
  );
  await audit('user.register', user.id, { email }, ip);

  return ok({ status: 'VERIFY_REQUIRED', email: user.email });
}
