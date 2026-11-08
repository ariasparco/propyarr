import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';

type Evidence = {
  at?: string;
  balance?: number;
  equity?: number;
  source?: string;
  rules?: Array<{
    key: string;
    used: number;
    limit: number;
    pct: number;
    detail?: string | null;
  }>;
};

const RULE_FA: Record<string, string> = {
  DAILY_DRAWDOWN: 'دراوداون روزانه',
  MAX_DRAWDOWN: 'دراوداون کلی',
  FLOATING_RISK: 'ریسک شناور',
  INSTRUMENT: 'نماد غیرمجاز',
  HFT_COOLDOWN: 'وقفه پس از معامله زیان‌ده',
  CONSISTENCY: 'قانون ثبات',
};

/**
 * The numbers behind a failed account, as they stood when the verdict was made.
 *
 * A rule name on its own cannot answer a trader disputing their account: by the
 * time anyone looks, the balance has moved and the figure that tripped the rule
 * is gone. This renders the snapshot the engine froze at the moment it failed.
 */
export function BreachReason({
  detail,
  locale,
}: {
  detail: string | null;
  locale: Locale;
}) {
  if (!detail) return null;

  let data: Evidence;
  try {
    data = JSON.parse(detail) as Evidence;
  } catch {
    return null;
  }
  if (!data?.rules?.length) return null;

  const fa = locale === 'fa';

  return (
    <div className="mt-0.5 space-y-0.5">
      {data.rules.map((r) => {
        // Count-based rules (instrument, cooldown) have no monetary allowance,
        // so printing "$3 / $0" for them would be nonsense.
        const money = r.limit > 0;
        return (
          <div key={r.key} className="text-[0.65rem] text-red-300/60">
            <span className="font-mono">
              {money
                ? `${formatCurrency(r.used, locale)} / ${formatCurrency(r.limit, locale)}`
                : `${r.used} ${fa ? 'مورد' : 'hits'}`}
            </span>
            {money && <span className="opacity-70"> · {r.pct.toFixed(0)}%</span>}
            {data.rules && data.rules.length > 1 && (
              <span className="opacity-70"> · {RULE_FA[r.key] ?? r.key}</span>
            )}
          </div>
        );
      })}
      {data.at && (
        <div className="text-[0.6rem] text-white/25">
          {new Date(data.at).toLocaleString(fa ? 'fa-IR' : 'en-US')}
        </div>
      )}
    </div>
  );
}
