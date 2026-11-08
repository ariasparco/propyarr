import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getWallet } from '@/lib/wallet';
import { WalletPanel } from '@/components/dashboard/WalletPanel';

export default async function WalletPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const { balance, entries } = await getWallet(session.sub);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {dict.dashboard.nav.wallet}
        </h2>
        <p className="mt-1 text-sm text-white/50">{dict.wallet.subtitle}</p>
      </div>
      <WalletPanel
        locale={loc}
        balance={balance}
        entries={entries}
        t={dict.wallet}
      />
    </div>
  );
}
