import 'server-only';
import { prisma } from './prisma';
import { saveDataUri } from './storage';
import { renderCertificate, type CertificateStage } from './certificate';
import { formatCurrency } from './format';
import { audit } from './api';
import { email as mailer } from './email';

/**
 * Generates and stores a certificate for a completed stage.
 *
 * Idempotent: an existing certificate for the same account and stage is left
 * alone, so a manual upload by an admin is never overwritten by the automatic
 * pass and a repeated check does not re-issue.
 */
export async function issueCertificate(
  accountId: string,
  stage: CertificateStage,
  opts: { notify?: boolean } = {},
): Promise<string | null> {
  const existing = await prisma.certificate.findUnique({
    where: { accountId_stage: { accountId, stage } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      challenge: { select: { virtualCapital: true } },
    },
  });
  if (!account) return null;

  try {
    const image = await renderCertificate({
      name: account.user.name,
      stage,
      accountNumber: account.accountNumber,
      // The certificate is an English document — keep the figures Latin too.
      capital: formatCurrency(account.challenge.virtualCapital, 'en'),
      issuedAt: new Date(),
    });
    const png = Buffer.from(await image.arrayBuffer());
    const stored = await saveDataUri(
      `data:image/png;base64,${png.toString('base64')}`,
      'certificates',
    );
    if (!stored) return null;

    const certificate = await prisma.certificate.create({
      data: {
        userId: account.user.id,
        accountId: account.id,
        stage,
        imagePath: stored.relativePath,
        mime: 'image/png',
      },
    });

    await audit('certificate.auto', account.user.id, {
      accountId: account.id,
      stage,
    });
    if (opts.notify !== false) {
      await mailer.certificateIssued(account.user.email, account.accountNumber);
    }
    return certificate.id;
  } catch (err) {
    // A certificate is a reward, never a blocker — a failure here must not stop
    // the trader from progressing.
    console.error('certificate generation failed', accountId, stage, err);
    return null;
  }
}
