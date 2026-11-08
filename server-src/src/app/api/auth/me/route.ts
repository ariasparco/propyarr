import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      kycStatus: true,
      country: true,
      phone: true,
    },
  });
  if (!user) return fail('unauthorized', 401);
  return ok({ user });
}
