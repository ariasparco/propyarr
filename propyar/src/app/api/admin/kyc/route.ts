import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { adminKycActionSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';
import { email as mailer } from '@/lib/email';

// Admin approves or rejects a KYC submission.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminKycActionSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const kyc = await prisma.kyc.findUnique({
    where: { id: parsed.data.kycId },
    include: { user: { select: { email: true } } },
  });
  if (!kyc) return fail('not_found', 404);

  const status = parsed.data.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  await prisma.kyc.update({
    where: { id: kyc.id },
    data: {
      status,
      reviewedAt: new Date(),
      rejectReason: status === 'REJECTED' ? parsed.data.reason || null : null,
    },
  });
  await prisma.user.update({
    where: { id: kyc.userId },
    data: { kycStatus: status },
  });
  await audit(`admin.kyc.${status.toLowerCase()}`, session.sub, {
    kycId: kyc.id,
  });
  await mailer.kycReviewed(kyc.user.email, status === 'APPROVED');
  return ok({ status });
}
