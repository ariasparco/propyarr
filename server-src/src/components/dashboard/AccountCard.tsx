import { formatCurrency, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import type { AccountView } from '@/lib/types';
import { StatusBadge, ProgressBar } from './Widgets';
import { AccountMonitor } from './AccountMonitor';
import { AdvanceButton } from './AdvanceButton';

export function AccountCard({
  account,
  locale,
  dict,
}: {
  account: AccountView;
  locale: Locale;
  dict: Dictionary;
}) {
  const a = dict.dashboard.account;
  const m = account.metrics;
  const profitTone = m.profit >= 0 ? 'text-brand-300' : 'text-red-300';

  const cells: Array<{ label: string; value: string; tone?: string }> = [
    { label: a.balance, value: formatCurrency(account.balance, locale) },
    { label: a.equity, value: formatCurrency(account.equity, locale) },
    {
      label: a.profit,
      value: `${m.profit >= 0 ? '+' : ''}${formatCurrency(m.profit, locale)}`,
      tone: profitTone,
    },
    {
      label: a.drawdown,
      value: `${m.drawdownPct.toFixed(1)}%`,
    },
  ];

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-white">
              #{account.accountNumber}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[0.7rem] text-white/60">
              {dict.plansPage.typeLabels[
                account.accountType as keyof typeof dict.plansPage.typeLabels
              ] ?? account.accountType}{' '}
              · {account.challengeName}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/40">
            {account.platform} · {account.server}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge
            status={account.status}
            label={
              dict.status[account.status as keyof typeof dict.status] ??
              account.status
            }
          />
          <span className="text-xs text-white/40">
            {a.phase}:{' '}
            {dict.status[account.phase as keyof typeof dict.status] ??
              account.phase}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-white/[0.06] bg-ink-850/60 p-3"
          >
            <p className="text-[0.7rem] text-white/40">{c.label}</p>
            <p className={`mt-1 font-mono text-sm font-semibold ${c.tone ?? 'text-white'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {account.password && (
        <div className="mt-5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.05] p-4">
          <p className="mb-3 text-xs font-semibold text-brand-300">
            {dict.dashboard.credentialsTitle}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              { label: a.login, value: account.accountNumber },
              { label: a.password, value: account.password },
              ...(account.investorPassword
                ? [{ label: a.investor, value: account.investorPassword }]
                : []),
              { label: a.server, value: account.server },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-[0.7rem] text-white/40">{c.label}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-white/90">
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {account.profitTarget > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">
              {a.progress}
              {/* The phase's own target, not the plan's headline one. A phase-2
                  account chases 5%, and the card used to print the 10% figure
                  from the plan row regardless of which phase it was in. */}
              <span className="ms-1.5 text-white/30">
                ({formatNumber(account.profitTarget, locale)}%)
              </span>
            </span>
            <span className="font-mono text-brand-300">
              {m.progressPct.toFixed(0)}%
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={m.progressPct} />
          </div>
          {/* The objective stated as what it is: a balance to reach. A loss
              moves that further away, so what is left is measured from the
              balance now — not from the target minus a floored profit. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.7rem]">
            <span className="text-white/40">
              {a.targetBalance}:{' '}
              <span className="font-mono text-white/70">
                {formatCurrency(m.targetBalance, locale)}
              </span>
            </span>
            {m.targetRemaining > 0 ? (
              <span className="text-white/40">
                {a.targetRemaining}:{' '}
                <span className="font-mono text-brand-300">
                  {formatCurrency(m.targetRemaining, locale)}
                </span>
              </span>
            ) : (
              <span className="font-medium text-emerald-300">
                {a.targetHit}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.06] pt-4 text-xs text-white/50">
        <span>
          {a.tradingDays}:{' '}
          <span className="font-mono text-white/80">{account.tradingDays}</span>
        </span>
        <span>
          {dict.dashboard.overview.winRate}:{' '}
          <span className="font-mono text-white/80">
            {m.winRate.toFixed(0)}%
          </span>
        </span>
        <span>
          {a.floatingPl}:{' '}
          <span className={`font-mono ${m.floatingPl >= 0 ? 'text-brand-300' : 'text-red-300'}`}>
            {formatCurrency(m.floatingPl, locale)}
          </span>
        </span>
      </div>

      {(account.breachRule || account.breachNote) && (
        <div className="mt-4 space-y-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {account.breachRule && (
            <div>
              ⚠{' '}
              {dict.monitor.rules[
                account.breachRule as keyof typeof dict.monitor.rules
              ]?.name ?? account.breachRule}
              {account.breachSource === 'ADMIN' && (
                <span className="opacity-70"> · {dict.monitor.byAdmin}</span>
              )}
            </div>
          )}
          {/* A verdict reached by a person, in that person's words.
              Automatic breaches point at a rule the trader can go and read;
              a manual one points at nothing, so without this the account just
              stops working and support fields the same question every time. */}
          {account.breachNote && (
            <div className="rounded-lg border border-red-500/20 bg-red-950/30 px-2.5 py-2">
              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-300/60">
                {dict.monitor.breachNote}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed text-red-200/90">
                {account.breachNote}
              </p>
              <p className="mt-1.5 text-[0.65rem] text-red-300/50">
                {dict.monitor.breachNoteHelp}
              </p>
            </div>
          )}
        </div>
      )}

      {account.certificates.length > 0 && (
        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <p className="mb-3 text-xs font-semibold text-emerald-300">
            {dict.certificate.yours}
          </p>
          <div className="flex flex-wrap gap-2">
            {account.certificates.map((c) => (
              <a
                key={c.id}
                href={`/api/certificates/${c.id}?download=1`}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/20"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {dict.certificate.stages[
                  c.stage as keyof typeof dict.certificate.stages
                ] ?? c.stage}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Open while the account is live, not only after the panel has declared
          it passed: the verdict is reached by staff reading the account, so the
          trader is the one who decides when to put it in front of them. */}
      {(account.status === 'ACTIVE' || account.status === 'PASSED') &&
        account.phase !== 'FUNDED' && (
          <AdvanceButton
            accountId={account.id}
            phase={account.phase}
            request={account.advanceRequest}
            t={dict.advance}
          />
        )}

      {account.status !== 'DISABLED' && (
        <AccountMonitor
          accountId={account.id}
          locale={locale}
          t={dict.monitor}
        />
      )}
    </div>
  );
}
