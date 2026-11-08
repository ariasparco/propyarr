import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, audit } from '@/lib/api';
import { discountCodeSchema, discountToggleSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = discountCodeSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  // Codes are matched case-insensitively by storing them upper-case.
  const code = parsed.data.code.toUpperCase();
  try {
    const created = await prisma.discountCode.create({
      data: {
        code,
        percent: parsed.data.percent,
        challengeId: parsed.data.challengeId || null,
        maxUses: parsed.data.maxUses ?? null,
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
        showInBanner: parsed.data.showInBanner ?? false,
        bannerLabel: parsed.data.bannerLabel || null,
      },
    });
    await audit('admin.discount.create', session.sub, { code });
    return ok({ id: created.id });
  } catch {
    return fail('code_exists', 409);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = discountToggleSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const row = await prisma.discountCode.findUnique({
    where: { id: parsed.data.id },
  });
  if (!row) return fail('not_found', 404);

  if (parsed.data.action === 'DELETE') {
    await prisma.discountCode.delete({ where: { id: row.id } });
    await audit('admin.discount.delete', session.sub, { code: row.code });
    return ok({ deleted: true });
  }

  if (parsed.data.action === 'BANNER') {
    const flipped = await prisma.discountCode.update({
      where: { id: row.id },
      data: { showInBanner: !row.showInBanner },
    });
    await audit('admin.discount.banner', session.sub, {
      code: row.code,
      showInBanner: flipped.showInBanner,
    });
    return ok({ showInBanner: flipped.showInBanner });
  }

  const updated = await prisma.discountCode.update({
    where: { id: row.id },
    data: { active: !row.active },
  });
  await audit('admin.discount.toggle', session.sub, {
    code: row.code,
    active: updated.active,
  });
  return ok({ active: updated.active });
}
