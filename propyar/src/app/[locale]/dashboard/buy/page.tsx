import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges } from '@/lib/data';
import { formatCurrency } from '@/lib/format';
import { getUsdIrrRate } from '@/lib/fx';
import { enabledMethods } from '@/lib/payments';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PurchaseCard } from '@/components/dashboard/PurchaseCard';
import { planDetailGroups } from '@/lib/plan-display';
import { CHALLENGE_TYPES } from '@/lib/constants';
import Link from 'next/link';
import { path } from '@/lib/routes';

export default async function BuyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { locale } = await params;
  const { type: wantedType } = await searchParams;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const plans = await getActiveChallenges();
  const types = CHALLENGE_TYPES.filter((t) => plans.some((p) => p.accountType === t));
  const type = (types as readonly string[]).includes(wantedType ?? '')
    ? (wantedType as (typeof CHALLENGE_TYPES)[number])
    : types[0] ?? 'ONE_STEP';
  const active = plans.filter((p) => !p.comingSoon && p.accountType === type);
  const soon = plans.filter((p) => p.comingSoon && p.accountType === type);
  const details = dict.dashboard.buy.details;
  const typeLabels = dict.plansPage.typeLabels;
  const { rate } = await getUsdIrrRate();
  const methods = enabledMethods().filter(
    (m): m is 'card' | 'paystar' | 'usdt' => m !== 'mock',
  );
  const session = await getSession();
  const me = session
    ? await prisma.user.findUnique({
        where: { id: session.sub },
        select: { walletBalance: true, kycStatus: true },
      })
    : null;
  const walletBalance = me?.walletBalance ?? 0;
  const k = dict.kyc;

  // No challenge is sold before identity is approved; the API enforces the
  // same rule, this just explains it instead of showing cards that would fail.
  if (me?.kycStatus !== 'APPROVED') {
    const pending = me?.kycStatus === 'PENDING';
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 text-center">
          <h2 className="text-xl font-bold text-white">{k.gateTitle}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60">
            {pending ? k.gatePending : k.gateText}
          </p>
          <Link href={path(loc, '/dashboard/kyc')} className="btn-primary mt-6">
            {k.gateButton}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {dict.dashboard.buy.title}
        </h2>
        <p className="mt-1 text-sm text-white/50">{dict.dashboard.buy.subtitle}</p>
      </div>

      {/* One plan model at a time: its six sizes side by side, every rule shown. */}
      <div className="flex w-full max-w-2xl rounded-2xl border border-white/10 bg-paper p-1.5 shadow-card">
        {types.map((t) => (
          <Link
            key={t}
            href={`${path(loc, '/dashboard/buy')}?type=${t}`}
            className={
              'flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-bold transition-all ' +
              (t === type ? 'bg-[#0B5A37] text-paper shadow-glow' : 'text-white/70 hover:text-white')
            }
          >
            {typeLabels[t]}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
            details={planDetailGroups(plan, details, loc)}
            typeLabel={typeLabels[plan.accountType as keyof typeof typeLabels]}
            popularLabel={details.popular}
            feeLabel={details.fee}
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

      <div className="rounded-2xl border border-white/[0.07] bg-paper p-5 shadow-card">
        <h3 className="text-base font-extrabold text-white">{details.sharedRules}</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {dict.planDetails.general.map((g) => (
            <li key={g} className="flex items-start gap-2 text-sm leading-relaxed text-white/70">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-brand-500" />
              {g}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
