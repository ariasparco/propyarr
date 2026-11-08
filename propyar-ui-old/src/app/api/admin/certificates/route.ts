import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, audit } from '@/lib/api';
import {
  certificateUploadSchema,
  certificateDeleteSchema,
} from '@/lib/validation';
import { saveDataUri, deleteStored } from '@/lib/storage';
import { email as mailer } from '@/lib/email';
import { issueCertificate } from '@/lib/certificate-issue';
import type { CertificateStage } from '@/lib/certificate';

// Admin issues an achievement certificate for a stage the trader completed.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  // No image supplied → generate one from the template instead of uploading.
  if (
    typeof body === 'object' &&
    body !== null &&
    !('image' in body) &&
    'accountId' in body &&
    'stage' in body
  ) {
    const { accountId, stage } = body as {
      accountId: string;
      stage: CertificateStage;
    };
    const previous = await prisma.certificate.findUnique({
      where: { accountId_stage: { accountId, stage } },
    });
    if (previous) {
      await prisma.certificate.delete({ where: { id: previous.id } });
      await deleteStored(previous.imagePath);
    }
    const id = await issueCertificate(accountId, stage, { notify: !previous });
    if (!id) return fail('generation_failed', 500);
    await audit('admin.certificate.generate', session.sub, { accountId, stage });
    return ok({ certificateId: id, generated: true });
  }

  const parsed = certificateUploadSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const account = await prisma.tradingAccount.findUnique({
    where: { id: parsed.data.accountId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!account) return fail('account_not_found', 404);

  const stored = await saveDataUri(parsed.data.image, 'certificates');
  if (!stored) return fail('unsupported_image', 415);

  const existing = await prisma.certificate.findUnique({
    where: {
      accountId_stage: { accountId: account.id, stage: parsed.data.stage },
    },
  });

  const certificate = await prisma.certificate.upsert({
    where: {
      accountId_stage: { accountId: account.id, stage: parsed.data.stage },
    },
    update: {
      imagePath: stored.relativePath,
      mime: stored.mime,
      note: parsed.data.note || null,
    },
    create: {
      userId: account.user.id,
      accountId: account.id,
      stage: parsed.data.stage,
      imagePath: stored.relativePath,
      mime: stored.mime,
      note: parsed.data.note || null,
    },
  });

  // Remove the replaced file only after the new one is recorded.
  if (existing?.imagePath) await deleteStored(existing.imagePath);

  await audit('admin.certificate.issue', session.sub, {
    accountId: account.id,
    stage: parsed.data.stage,
  });
  if (!existing) {
    await mailer.certificateIssued(account.user.email, account.accountNumber);
  }

  return ok({ certificateId: certificate.id });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = certificateDeleteSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const certificate = await prisma.certificate.findUnique({
    where: { id: parsed.data.certificateId },
  });
  if (!certificate) return fail('not_found', 404);

  await prisma.certificate.delete({ where: { id: certificate.id } });
  await deleteStored(certificate.imagePath);
  await audit('admin.certificate.delete', session.sub, {
    certificateId: certificate.id,
  });

  return ok({ deleted: true });
}
