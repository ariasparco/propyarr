import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { readStored } from '@/lib/storage';

// Serves a certificate image. Only the trader it belongs to, or an admin, may
// fetch it — certificates carry the holder's name, so they are not public.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);

  const { id } = await params;
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { account: { select: { accountNumber: true } } },
  });
  if (!certificate) return fail('not_found', 404);
  if (session.role !== 'ADMIN' && certificate.userId !== session.sub)
    return fail('forbidden', 403);

  const file = await readStored(certificate.imagePath);
  if (!file) return fail('not_found', 404);

  // ?download=1 saves the file instead of previewing it in the tab.
  const download = new URL(req.url).searchParams.get('download') === '1';
  const ext = certificate.imagePath.split('.').pop() ?? 'png';
  const filename = `certificate-${certificate.account.accountNumber}-${certificate.stage}.${ext}`;

  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.mime,
      'Cache-Control': 'private, no-store',
      ...(download
        ? { 'Content-Disposition': `attachment; filename="${filename}"` }
        : {}),
    },
  });
}
