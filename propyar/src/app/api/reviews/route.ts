import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { reviewSubmitSchema } from '@/lib/validation';
import { ok, fail, rateLimit, clientIp, audit } from '@/lib/api';

// A visitor leaves a review. It is stored as PENDING and appears on the
// homepage only after staff approve it.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`review:${ip}`, 3, 60 * 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = reviewSubmitSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const session = await getSession();
  const review = await prisma.review.create({
    data: {
      userId: session?.sub ?? null,
      name: parsed.data.name,
      gender: parsed.data.gender,
      rating: parsed.data.rating,
      text: parsed.data.text,
    },
  });
  await audit('review.submit', session?.sub ?? null, { reviewId: review.id }, ip);
  return ok({ status: 'PENDING' });
}
