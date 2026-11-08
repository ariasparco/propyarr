import Link from 'next/link';
import { formatCurrency } from '@/lib/format';
import { path } from '@/lib/routes';
import type { CSSProperties } from 'react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import type { PlanView } from '@/lib/types';
import { planAccent } from '@/lib/plan-accents';

export function PlanCard({
  plan,
  locale,
  dict,
}: {
  plan: PlanView;
  locale: Locale;
  dict: Dictionary;
}) {
  const p = dict.plansPage;
  const soon = plan.comingSoon;
  const accent = planAccent(plan.slug);
  const typeLabel =
    p.typeLabels[plan.accountType as keyof typeof p.typeLabels] ??
    plan.accountType;

  const rows: Array<[string, string]> = [
    [p.feature.profitTargetP1, `${plan.profitTarget}%`],
    [p.feature.profitTargetP2, `${plan.profitTargetP2}%`],
    [p.feature.dailyDrawdown, `${plan.dailyDrawdown}%`],
    [p.feature.maxDrawdown, `${plan.maxDrawdown}%`],
    [p.feature.minDays, String(plan.minTradingDays)],
    [p.feature.leverage, `1:${plan.leverage}`],
    [p.feature.split, `${plan.profitSplit}%`],
    [p.feature.instrument, 'XAU/USD'],
  ];

  return (
    <div
      style={{ '--accent': accent } as CSSProperties}
      className={
        'card relative flex flex-col overflow-hidden p-7 transition-all duration-300 ' +
        (soon ? 'opacity-85 ' : '') +
        'hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-[0_24px_60px_-24px_var(--accent)]'
      }
    >
      {/* accent stripe */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
      {/* accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 end-[-20%] h-40 w-40 rounded-full opacity-20 blur-3xl"
        style={{ background: accent }}
      />

      {plan.popular && !soon && (
        <span
          className="absolute -top-0.5 start-7 rounded-b-lg px-3 py-1 text-xs font-bold text-paper"
          style={{ background: accent }}
        >
          {dict.common.mostPopular}
        </span>
      )}
      {soon && (
        <span
          className="absolute -top-0.5 start-7 rounded-b-lg border-x border-b px-3 py-1 text-xs font-bold"
          style={{ color: accent, borderColor: accent }}
        >
          {p.comingSoon}
        </span>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span
          className="rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            color: accent,
            borderColor: `${accent}55`,
            background: `${accent}14`,
          }}
        >
          {typeLabel}
        </span>
        <span className="text-xs text-white/40">{plan.name}</span>
      </div>

      <div className="mt-5">
        <p className="text-sm text-white/40">{p.feature.capital}</p>
        <p className="font-display text-4xl font-extrabold text-white">
          {formatCurrency(plan.virtualCapital, locale)}
        </p>
      </div>

      <div className="mt-5 flex items-end gap-1.5 border-y border-white/[0.06] py-4">
        {soon ? (
          <span className="font-display text-2xl font-bold text-white/40">
            {p.comingSoon}
          </span>
        ) : (
          <>
            <span
              className="font-display text-2xl font-bold"
              style={{ color: accent }}
            >
              {formatCurrency(plan.price, locale)}
            </span>
            <span className="pb-1 text-xs text-white/40">
              {dict.common.perAccount}
            </span>
          </>
        )}
      </div>

      <dl className="mt-5 flex-1 space-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <dt className="text-white/50">{k}</dt>
            <dd className="font-mono font-medium text-white/90">{v}</dd>
          </div>
        ))}
      </dl>

      {/* A disabled plan stays a dead button; the rest go to checkout, where
          signed-out visitors are sent to log in first. */}
      <div className="mt-7">
        {soon ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="btn w-full cursor-not-allowed border font-semibold opacity-60"
            style={{ color: accent, borderColor: `${accent}55` }}
          >
            {p.comingSoon}
          </button>
        ) : (
          <Link
            href={path(locale, '/dashboard/buy')}
            className="btn w-full border font-semibold transition-colors"
            style={{ color: accent, borderColor: `${accent}55` }}
          >
            {dict.common.startChallenge}
          </Link>
        )}
      </div>
    </div>
  );
}
