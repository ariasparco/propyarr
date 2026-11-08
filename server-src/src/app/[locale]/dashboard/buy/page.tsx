import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges } from '@/lib/data';
import { formatCurrency } from '@/lib/format';
import { getUsdIrrRate } from '@/lib/fx';
import { enabledMethods } from '@/lib/payments';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PurchaseCard } from '@/components/dashboard/PurchaseCard';

export default async function BuyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const plans = await getActiveChallenges();
  const active = plans.filter((p) => !p.comingSoon);
  const soon = plans.filter((p) => p.comingSoon);
  const { rate } = await getUsdIrrRate();
  const methods = enabledMethods().filter(
    (m): m is 'card' | 'paystar' | 'usdt' => m !== 'mock',
  );
  const session = await getSession();
  const walletBalance = session
    ? ((
        await prisma.user.findUnique({
          where: { id: session.sub },
          select: { walletBalance: true },
        })
      )?.walletBalance ?? 0)
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {dict.dashboard.buy.title}
        </h2>
        <p className="mt-1 text-sm text-white/50">{dict.dashboard.buy.subtitle}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {active.map((plan) => (
          <PurchaseCard
            key={plan.id}
            plan={plan}
            locale={loc}
            t={dict.checkout}
            tomanPrice={Math.round((plan.price * rate) / 10)}
            usdIrrRate={rate}
            methods={methods}
            walletBalance={walletBalance}
          />
        ))}
      </div>

      {soon.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {soon.map((plan) => (
            <div key={plan.id} className="card flex flex-col p-6 opacity-70">
              <span className="text-xs text-white/40">{plan.name}</span>
              <p className="mt-2 font-display text-3xl font-extrabold text-white">
                {formatCurrency(plan.virtualCapital, loc)}
              </p>
              <p className="mt-5 rounded-xl border border-white/10 py-2.5 text-center text-sm text-white/40">
                {dict.plansPage.comingSoon}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
