import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { prisma } from '@/lib/prisma';
import { DiscountManager } from '@/components/admin/DiscountManager';

export default async function AdminDiscountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);

  const [codes, plans] = await Promise.all([
    prisma.discountCode.findMany({
      include: { challenge: { select: { name: true, accountType: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.challenge.findMany({
      where: { active: true },
      select: { id: true, name: true, accountType: true },
      orderBy: { virtualCapital: 'asc' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-xl font-semibold text-white">
        {dict.admin.nav.discounts}
      </h2>
      <DiscountManager
        rows={codes.map((c) => ({
          id: c.id,
          code: c.code,
          percent: c.percent,
          planName: c.challenge
            ? `${c.challenge.accountType} ${c.challenge.name}`
            : null,
          maxUses: c.maxUses,
          usedCount: c.usedCount,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          active: c.active,
        }))}
        plans={plans.map((p) => ({
          id: p.id,
          label: `${p.accountType} ${p.name}`,
        }))}
        t={dict.admin.discounts}
      />
    </div>
  );
}
