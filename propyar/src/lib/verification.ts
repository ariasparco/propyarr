import 'server-only';
import crypto from 'crypto';
import { prisma } from './prisma';

// Six-digit codes for signup confirmation and password reset. Only the hash is
// stored, the code expires quickly, and wrong guesses are counted — a short code
// is only safe with all three.

const TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export type CodePurpose = 'VERIFY' | 'RESET';

function hash(userId: string, purpose: CodePurpose, code: string): string {
  // Scoped to the user and purpose so a signup code cannot reset a password.
  return crypto
    .createHash('sha256')
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex');
}

function generateCode(): string {
  // 000000–999999, uniformly distributed.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function createCode(
  userId: string,
  purpose: CodePurpose,
): Promise<string> {
  // Only the newest code should work.
  await prisma.authToken.updateMany({
    where: { userId, type: purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateCode();
  await prisma.authToken.create({
    data: {
      userId,
      type: purpose,
      tokenHash: hash(userId, purpose, code),
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
    },
  });
  return code;
}

export type VerifyResult =
  | 'OK'
  | 'INVALID'
  | 'EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'NO_CODE';

/** Checks a code and consumes it on success. */
export async function confirmCode(
  userId: string,
  purpose: CodePurpose,
  code: string,
): Promise<VerifyResult> {
  const active = await prisma.authToken.findFirst({
    where: { userId, type: purpose, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!active) return 'NO_CODE';
  if (active.expiresAt < new Date()) return 'EXPIRED';
  if (active.attempts >= MAX_ATTEMPTS) return 'TOO_MANY_ATTEMPTS';

  if (active.tokenHash !== hash(userId, purpose, code.trim())) {
    await prisma.authToken.update({
      where: { id: active.id },
      data: { attempts: { increment: 1 } },
    });
    return 'INVALID';
  }

  // Claim it — a second concurrent request finds usedAt already set.
  const claimed = await prisma.authToken.updateMany({
    where: { id: active.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 0 ? 'INVALID' : 'OK';
}

export async function createVerificationCode(userId: string): Promise<string> {
  return createCode(userId, 'VERIFY');
}

export async function confirmVerificationCode(
  userId: string,
  code: string,
): Promise<VerifyResult> {
  const result = await confirmCode(userId, 'VERIFY', code);
  if (result === 'OK') {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });
  }
  return result;
}

export const VERIFICATION_TTL_MINUTES = TTL_MINUTES;
