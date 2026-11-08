'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatNumber } from '@/lib/format';
import { path } from '@/lib/routes';
import { CHALLENGE_TYPES } from '@/lib/constants';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import type { PlanView } from '@/lib/types';
import { ArrowIcon, StarIcon } from '@/components/site/Icons';

type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export function PlanTabs({
  plans,
  locale,
  dict,
  initialType = 'ONE_STEP',
  showDetails = false,
}: {
  plans: PlanView[];
  locale: Locale;
  dict: Dictionary;
  initialType?: string;
  showDetails?: boolean;
}) {
  const [type, setType] = useState<ChallengeType>(
    (CHALLENGE_TYPES as readonly string[]).includes(initialType)
      ? (initialType as ChallengeType)
      : 'ONE_STEP',
  );
  const labels = dict.plansPage.typeLabels;
  const group = plans.filter((p) => p.accountType === type);

  return (
    <div>
      <div
        role="tablist"
        className="mx-auto flex w-full max-w-xl rounded-2xl border border-white/15 bg-ink-900/60 p-1"
      >
        {CHALLENGE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === type}
            onClick={() => setType(t)}
            className={
              'flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition-all sm:text-[15px] ' +
              (t === type
                ? 'bg-brand-gradient text-ink-950 shadow-glow'
                : 'text-white/85 hover:text-white')
            }
          >
            {labels[t]}
          </button>
        ))}
      </div>

      {group.length === 0 ? (
        <p className="mt-10 text-center text-white/50">{dict.home.noPlans}</p>
      ) : (
        <div className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
          {group.map((plan) => (
            <PlanTile key={plan.id} plan={plan} locale={locale} dict={dict} />
          ))}
        </div>
      )}

      {showDetails && <PlanDetails type={type} dict={dict} />}
    </div>
  );
}

function pct(value: number, locale: Locale) {
  return `${formatNumber(value, locale)}%`;
}

function PlanTile({
  plan,
  locale,
  dict,
}: {
  plan: PlanView;
  locale: Locale;
  dict: Dictionary;
}) {
  const c = dict.home.card;
  const popular = plan.popular && !plan.comingSoon;

  const rows: Array<[string, string]> =
    plan.accountType === 'TWO_STEP'
      ? [
          [c.targetP1, pct(plan.profitTarget, locale)],
          [c.targetP2, pct(plan.profitTargetP2, locale)],
          [c.daily, pct(plan.dailyDrawdown, locale)],
          [c.total, pct(plan.maxDrawdown, locale)],
        ]
      : plan.accountType === 'INSTANT'
        ? [
            [c.payoutFrom, pct(plan.profitTarget, locale)],
            [c.daily, plan.dailyDrawdown > 0 ? pct(plan.dailyDrawdown, locale) : c.none],
            [c.total, pct(plan.maxDrawdown, locale)],
          ]
        : [
            [c.target, pct(plan.profitTarget, locale)],
            [c.daily, pct(plan.dailyDrawdown, locale)],
            [c.total, pct(plan.maxDrawdown, locale)],
          ];

  return (
    <div
      className={
        'relative flex flex-col rounded-2xl border px-4 pb-4 pt-6 transition-all duration-300 hover:-translate-y-1 ' +
        (popular
          ? 'border-brand-400/80 bg-gradient-to-b from-teal-700/60 to-ink-900/90 shadow-[0_0_0_1px_rgba(46,235,158,0.35),0_0_36px_-6px_rgba(46,235,158,0.55)]'
          : 'border-brand-400/20 bg-gradient-to-b from-teal-800/40 to-ink-900/80 hover:border-brand-400/45')
      }
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-gold-400 px-3 py-0.5 text-[11px] font-bold text-ink-950">
          <StarIcon size={11} />
          {dict.home.popular}
        </span>
      )}

      <p dir="ltr" className="text-center font-sans text-[1.65rem] font-extrabold text-white">
        ${plan.virtualCapital.toLocaleString('en-US')}
      </p>
      <p className="mt-0.5 text-center text-xs text-white/55">
        {dict.home.fee}:{' '}
        <span dir="ltr" className="font-bold text-brand-300">
          {plan.comingSoon ? '—' : `$${plan.price.toLocaleString('en-US')}`}
        </span>
      </p>

      <dl className="mt-4 flex-1 space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 text-[13px]">
            <dt className="text-white/80">{k}:</dt>
            <dd className="font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>

      {plan.comingSoon ? (
        <span className="btn mt-4 w-full cursor-not-allowed rounded-lg border border-white/20 py-2 text-white/50">
          {dict.plansPage.comingSoon}
        </span>
      ) : (
        <Link
          href={path(locale, '/dashboard/buy')}
          className={
            'btn mt-4 w-full gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] sm:text-sm ' +
            (popular
              ? 'bg-brand-gradient font-bold text-ink-950 shadow-glow hover:brightness-110'
              : 'border border-white/60 text-white hover:border-brand-300 hover:text-brand-200')
          }
        >
          {dict.common.startChallenge}
          <ArrowIcon size={16} className="ltr:rotate-180" />
        </Link>
      )}
    </div>
  );
}

function PlanDetails({ type, dict }: { type: ChallengeType; dict: Dictionary }) {
  const d = dict.planDetails;
  const detail = d[type];
  const columns: Array<[string, string[]]> = [
    [d.challengeStage, detail.challenge],
    [d.fundedStage, detail.funded],
  ];
  return (
    <div className="mt-12 grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="panel p-6 sm:p-8">
        <h3 className="text-xl font-bold text-brand-300">{detail.title}</h3>
        <div className="mt-5 grid gap-8 sm:grid-cols-2">
          {columns
            .filter(([, items]) => items.length > 0)
            .map(([title, items]) => (
              <div key={title}>
                <p className="mb-3 border-b border-brand-400/15 pb-2 text-sm font-semibold text-white/60">
                  {title}
                </p>
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-white/85">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-brand-400 shadow-[0_0_8px_rgba(46,235,158,0.8)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
      <div className="panel p-6 sm:p-8">
        <h3 className="text-lg font-bold text-white">{d.generalTitle}</h3>
        <ul className="mt-5 space-y-3">
          {d.general.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/80">
              <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-gold-400" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
