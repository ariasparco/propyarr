// What a buyer is shown about a plan, built from the plan's own row and the
// model-level rules in plan-rules.ts, so the purchase page can never quote
// figures the risk engine does not enforce.
import { planRules } from './plan-rules';
import type { PlanView } from './types';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';

export type DetailGroup = { title: string; rows: Array<[string, string]> };

type T = Dictionary['dashboard']['buy']['details'];

export function planDetailGroups(plan: PlanView, t: T, locale: Locale): DetailGroup[] {
  const n = (v: number) => v.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');
  const pct = (v: number) => `${n(v)}٪`;
  const days = (v: number) => t.days.replace('{n}', n(v));
  const rules = planRules(plan.accountType);
  const [s1, s2, s3] = rules.splitTiers;
  const split = `${pct(s1)} ← ${pct(s2)} ← ${pct(s3)}`;
  const daily = plan.dailyDrawdown > 0 ? pct(plan.dailyDrawdown) : t.none;

  const main: Array<[string, string]> = [
    [
      t.payoutTarget,
      plan.accountType === 'INSTANT'
        ? t.payoutFrom.replace('{n}', n(rules.payoutTargetPct))
        : t.payoutBand.replace('{a}', n(rules.payoutTargetPct)).replace('{b}', n(rules.payoutTargetMaxPct)),
    ],
    [t.minDays, days(rules.fundedMinTradingDays)],
    [t.split, split],
    ...(rules.refundWithPayout ? ([[t.refund, t.refundValue]] as Array<[string, string]>) : []),
    [t.payoutDays, t.payoutDaysValue],
  ];

  if (plan.accountType === 'INSTANT') {
    return [
      {
        title: t.directAccount,
        rows: [
          [t.daily, daily],
          [t.total, pct(plan.maxDrawdown)],
          [t.floating, pct(plan.floatingRisk)],
          [t.consistency, pct(50)],
          ...main,
          [t.leverage, `1:${n(plan.leverage)}`],
        ],
      },
    ];
  }

  const challenge: Array<[string, string]> =
    plan.accountType === 'TWO_STEP'
      ? [
          [t.targetP1, pct(plan.profitTarget)],
          [t.targetP2, pct(plan.profitTargetP2)],
        ]
      : [[t.target, pct(plan.profitTarget)]];

  return [
    {
      title: t.challengeStage,
      rows: [
        ...challenge,
        [t.daily, daily],
        [t.total, pct(plan.maxDrawdown)],
        [t.floating, pct(plan.floatingRisk)],
        [t.consistency, pct(50)],
        [t.minDays, days(plan.minTradingDays)],
        [t.timeLimit, t.none],
        [t.leverage, `1:${n(plan.leverage)}`],
      ],
    },
    { title: t.mainAccount, rows: main },
  ];
}
