import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getPayoutAccounts, getUserPayouts } from '@/lib/data';
import { PayoutManager } from '@/components/dashboard/PayoutManager';

export default async function PayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const [fundedAccounts, payouts] = await Promise.all([
    getPayoutAccounts(session.sub),
    getUserPayouts(session.sub),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-semibold text-white">
        {dict.dashboard.payouts.title}
      </h2>
      <PayoutManager
        locale={loc}
        dict={dict}
        fundedAccounts={fundedAccounts}
        payouts={payouts}
      />
    </div>
  );
}
