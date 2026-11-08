import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { kycSubmitSchema } from '@/lib/validation';
import { ok, fail, rateLimit, audit } from '@/lib/api';
import { saveDataUri, deleteStored } from '@/lib/storage';

// User submits a national ID / birth-certificate photo for verification.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`kyc:${session.sub}`, 5, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = kycSubmitSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const existing = await prisma.kyc.findUnique({
    where: { userId: session.sub },
  });
  if (existing?.status === 'APPROVED') return fail('already_approved', 409);

  const stored = await saveDataUri(parsed.data.image, 'kyc');
  if (!stored) return fail('unsupported_image', 415);

  await prisma.kyc.upsert({
    where: { userId: session.sub },
    update: {
      docType: parsed.data.docType,
      imagePath: stored.relativePath,
      image: null,
      status: 'PENDING',
      reviewedAt: null,
    },
    create: {
      userId: session.sub,
      docType: parsed.data.docType,
      imagePath: stored.relativePath,
      status: 'PENDING',
    },
  });

  // Drop the superseded file once the new one is safely recorded.
  if (existing?.imagePath) await deleteStored(existing.imagePath);

  await prisma.user.update({
    where: { id: session.sub },
    data: { kycStatus: 'PENDING' },
  });
  await audit('kyc.submit', session.sub, { docType: parsed.data.docType });
  return ok({ status: 'PENDING' });
}
