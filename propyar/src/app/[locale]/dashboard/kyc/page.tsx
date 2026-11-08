import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { KycForm } from '@/components/dashboard/KycForm';

export default async function KycPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { kycStatus: true, kyc: { select: { rejectReason: true } } },
  });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-bold text-white">{dict.kyc.title}</h2>
      <KycForm
        status={user.kycStatus}
        rejectReason={user.kyc?.rejectReason ?? null}
        t={dict.kyc}
      />
    </div>
  );
}
