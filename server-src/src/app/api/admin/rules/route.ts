import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { adminRulesSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';

// Updates the global rule settings the monitoring engine reads on every check.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminRulesSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const value = JSON.stringify({
    ...parsed.data,
    allowedSymbols: parsed.data.allowedSymbols.map((s) =>
      s.trim().toUpperCase(),
    ),
  });

  await prisma.setting.upsert({
    where: { key: 'rules' },
    update: { value },
    create: { key: 'rules', value },
  });
  await audit('admin.rules.update', session.sub, parsed.data);

  return ok({ saved: true });
}
