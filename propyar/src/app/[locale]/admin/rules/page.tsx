import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges, loadMonitorSettings } from '@/lib/data';
import { formatNumber } from '@/lib/format';
import { AdminTable } from '@/components/admin/AdminTable';
import { RulesEditor } from '@/components/admin/RulesEditor';

export default async function AdminRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const r = dict.admin.rules;
  const [rules, plans] = await Promise.all([
    loadMonitorSettings(),
    getActiveChallenges(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">{r.title}</h2>
        <p className="mt-1 text-sm text-white/50">{r.subtitle}</p>
      </div>

      {/* Global rules */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          {r.global}
        </h3>
        <RulesEditor
          initial={{
            consistencyRulePercent: rules.consistencyRulePercent,
            fundedMinTradingDays: rules.fundedMinTradingDays,
            hftCooldownMinutes: rules.hftCooldownMinutes,
            minHoldSeconds: rules.minHoldSeconds,
            dayResetUtcOffset: rules.dayResetUtcOffset,
            allowedSymbols: rules.allowedSymbols,
            weekendHoldingAllowed: rules.weekendHoldingAllowed,
            newsTradingAllowed: rules.newsTradingAllowed,
          }}
          t={{
            consistency: r.consistency,
            fundedMinDays: r.fundedMinDays,
            cooldown: r.cooldown,
            minHold: r.minHold,
            dayReset: r.dayReset,
            dayResetHint: r.dayResetHint,
            symbols: r.symbols,
            symbolsHint: r.symbolsHint,
            weekendHolding: r.weekendHolding,
            newsTrading: r.newsTrading,
            allowed: r.allowed,
            notAllowed: r.notAllowed,
            save: r.save,
            saving: r.saving,
            saved: r.saved,
            failed: r.failed,
          }}
        />
      </section>

      {/* Per-plan parameters */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          {r.planParams}
        </h3>
        <AdminTable
          headers={[
            dict.admin.table.plan,
            r.profitTarget,
            r.dailyDd,
            r.maxDd,
            r.minDays,
          ]}
          empty={plans.length === 0}
        >
          {plans.map((p) => (
            <tr key={p.id} className="text-white/80">
              <td className="px-4 py-3 font-medium text-white">
                {p.accountType} · {p.name}
              </td>
              <td className="px-4 py-3 font-mono text-brand-300">
                {formatNumber(p.profitTarget, loc)}%
              </td>
              <td className="px-4 py-3 font-mono text-white/70">
                {formatNumber(p.dailyDrawdown, loc)}%
              </td>
              <td className="px-4 py-3 font-mono text-white/70">
                {formatNumber(p.maxDrawdown, loc)}%
              </td>
              <td className="px-4 py-3 font-mono text-white/70">
                {formatNumber(p.minTradingDays, loc)}
              </td>
            </tr>
          ))}
        </AdminTable>
      </section>

      <p className="rounded-2xl border border-line bg-ink-850/60 px-5 py-4 text-xs text-white/40">
        {r.note}
      </p>
    </div>
  );
}
