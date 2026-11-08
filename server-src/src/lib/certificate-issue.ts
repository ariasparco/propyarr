import 'server-only';
import { prisma } from './prisma';
import { saveDataUri, deleteStored } from './storage';
import { renderCertificate, type CertificateStage } from './certificate';
import { formatCurrency } from './format';
import { audit } from './api';
import { email as mailer } from './email';

/**
 * Why a certificate could not be issued.
 *
 * Every one of these is actionable by whoever pressed the button, so they are
 * carried back rather than logged and swallowed. A bare null meant the panel
 * could only ever say "it did not save", while the actual reason — nearly
 * always an account that was never assigned to its trader — sat in the server
 * log where nobody looks.
 */
export type IssueFailure =
  | 'account_not_found'
  | 'account_unassigned'
  | 'owner_has_no_name'
  | 'render_failed';

export type IssueResult =
  | { ok: true; id: string }
  | { ok: false; reason: IssueFailure };

/**
 * Generates and stores a certificate for a completed stage.
 *
 * Idempotent by default: an existing certificate for the same account and stage
 * is returned as-is, so a manual upload by an admin is never overwritten by the
 * automatic pass and a repeated check does not re-issue. Pass `replace` to
 * regenerate — what an admin asking for a fresh one means.
 */
export async function issueCertificate(
  accountId: string,
  stage: CertificateStage,
  opts: { notify?: boolean; replace?: boolean } = {},
): Promise<IssueResult> {
  const existing = await prisma.certificate.findUnique({
    where: { accountId_stage: { accountId, stage } },
    select: { id: true, imagePath: true },
  });
  if (existing && !opts.replace) return { ok: true, id: existing.id };

  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      challenge: { select: { virtualCapital: true } },
    },
  });
  if (!account) return { ok: false, reason: 'account_not_found' };

  // The certificate carries the account owner's name, and that is only the
  // right name if the account is attached to the right person. An account still
  // sitting on an admin user is an unassigned one — it would print the admin's
  // name on the trader's award. Refuse rather than issue a wrong document; the
  // admin panel can assign the account and the certificate then generates.
  if (account.user.role === 'ADMIN') {
    console.warn(
      `certificate skipped for ${account.accountNumber}: account is still owned by an admin user — assign it to the trader first`,
    );
    return { ok: false, reason: 'account_unassigned' };
  }

  const traderName = account.user.name?.trim();
  if (!traderName) {
    console.warn(
      `certificate skipped for ${account.accountNumber}: owner has no name on file`,
    );
    return { ok: false, reason: 'owner_has_no_name' };
  }

  try {
    // Render and store the new image BEFORE touching the old one. Regenerating
    // used to delete the existing certificate first, so a render that failed
    // left the trader with nothing at all — the one outcome worse than an
    // out-of-date certificate.
    const image = await renderCertificate({
      name: traderName,
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
    if (!stored) return { ok: false, reason: 'render_failed' };

    // One row per account and stage, so a replacement swaps over in a single
    // step rather than deleting and hoping the create that follows succeeds.
    const certificate = await prisma.certificate.upsert({
      where: { accountId_stage: { accountId: account.id, stage } },
      update: { imagePath: stored.relativePath, mime: 'image/png' },
      create: {
        userId: account.user.id,
        accountId: account.id,
        stage,
        imagePath: stored.relativePath,
        mime: 'image/png',
      },
    });

    // Only now is the superseded file safe to remove.
    if (existing?.imagePath && existing.imagePath !== stored.relativePath) {
      await deleteStored(existing.imagePath);
    }

    await audit('certificate.auto', account.user.id, {
      accountId: account.id,
      stage,
    });
    if (opts.notify !== false) {
      await mailer.certificateIssued(account.user.email, account.accountNumber);
    }
    return { ok: true, id: certificate.id };
  } catch (err) {
    // A certificate is a reward, never a blocker — a failure here must not stop
    // the trader from progressing.
    console.error('certificate generation failed', accountId, stage, err);
    return { ok: false, reason: 'render_failed' };
  }
}
