import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { readStored } from '@/lib/storage';

// Serves an identity document. Only an admin, or the person who uploaded it,
// may read the file — the images are never exposed as static assets.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);

  const { id } = await params;
  const kyc = await prisma.kyc.findUnique({ where: { id } });
  if (!kyc) return fail('not_found', 404);
  if (session.role !== 'ADMIN' && kyc.userId !== session.sub)
    return fail('forbidden', 403);

  // Rows created before file storage still hold an inline data URI.
  if (!kyc.imagePath && kyc.image) {
    const match = /^data:([\w/+-]+);base64,(.+)$/s.exec(kyc.image);
    if (!match) return fail('not_found', 404);
    return new Response(Buffer.from(match[2], 'base64'), {
      headers: {
        'Content-Type': match[1],
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const file = kyc.imagePath ? await readStored(kyc.imagePath) : null;
  if (!file) return fail('not_found', 404);

  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.mime,
      'Cache-Control': 'private, no-store',
    },
  });
}
