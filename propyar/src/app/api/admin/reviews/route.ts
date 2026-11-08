import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { adminReviewActionSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';

// Staff approve, reject or delete a review.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminReviewActionSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const { reviewId, action } = parsed.data;
  if (action === 'DELETE') {
    await prisma.review.delete({ where: { id: reviewId } }).catch(() => null);
  } else {
    await prisma.review.update({
      where: { id: reviewId },
      data: {
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedAt: new Date(),
      },
    });
  }
  await audit(`admin.review.${action.toLowerCase()}`, session.sub, { reviewId });
  return ok({ done: true });
}
