import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getAccountViews } from '@/lib/data';
import { path } from '@/lib/routes';
import { AccountCard } from '@/components/dashboard/AccountCard';

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const accounts = await getAccountViews(session.sub);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">
          {dict.dashboard.nav.accounts}
        </h2>
        <Link href={path(loc, '/dashboard/buy')} className="btn-primary">
          {dict.dashboard.nav.buy}
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card p-12 text-center text-white/50">
          {dict.dashboard.overview.noAccounts}
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} locale={loc} dict={dict} />
          ))}
        </div>
      )}
    </div>
  );
}
