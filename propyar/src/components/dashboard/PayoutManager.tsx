'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import type { PayoutView } from '@/lib/types';
import { StatusBadge } from './Widgets';

type FundedAccount = {
  id: string;
  accountNumber: string;
  available: number;
  eligible: boolean;
  block: string | null;
  minAmount: number;
  daysRemaining: number;
  profitSplit: number;
  targetAmount: number;
  tradingDaysRemaining: number;
  refundAmount: number;
  nextPayoutAt: string;
};

export function PayoutManager({
  locale,
  dict,
  fundedAccounts,
  payouts,
}: {
  locale: Locale;
  dict: Dictionary;
  fundedAccounts: FundedAccount[];
  payouts: PayoutView[];
}) {
  const router = useRouter();
  const p = dict.dashboard.payouts;
  const [accountId, setAccountId] = useState(fundedAccounts[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = fundedAccounts.find((a) => a.id === accountId);

  function blockMessage(a: FundedAccount): string | null {
    if (a.eligible || !a.block) return null;
    const b = p.blocks;
    switch (a.block) {
      case 'KYC_REQUIRED':
        return b.kycRequired;
      case 'WAITING_PERIOD':
        return b.waitingPeriod.replace('{days}', String(a.daysRemaining));
      case 'NO_PROFIT':
        return b.belowMinimum.replace(
          '{amount}',
          formatCurrency(a.minAmount, locale),
        );
      case 'PENDING_REQUEST':
        return b.pendingRequest;
      case 'OPEN_POSITIONS':
        return b.openPositions;
      case 'MIN_TRADING_DAYS':
        return b.minTradingDays.replace('{days}', String(a.tradingDaysRemaining));
      case 'TARGET_NOT_MET':
        return b.targetNotMet.replace(
          '{amount}',
          formatCurrency(a.targetAmount, locale),
        );
      default:
        return b.notFunded;
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          amount: Number(fd.get('amount')),
          method: String(fd.get('method')),
          wallet: String(fd.get('wallet')),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === 'below_minimum'
            ? p.blocks.belowMinimum.replace(
                '{amount}',
                formatCurrency(selected?.minAmount ?? 0, locale),
              )
            : data.error === 'amount_exceeds_profit'
              ? p.blocks.exceedsAvailable
              : dict.contactPage.form.error,
        );
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError(dict.contactPage.form.error);
    } finally {
      setLoading(false);
    }
  }

  const blocked = selected ? blockMessage(selected) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      {/* Request form */}
      <div className="card h-fit p-6">
        <h3 className="text-lg font-semibold text-white">{p.request}</h3>
        {fundedAccounts.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">{dict.dashboard.overview.noAccounts}</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label className="field-label">{dict.admin.table.account}</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="field-input"
              >
                {fundedAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.accountNumber} — {p.eligible}:{' '}
                    {formatCurrency(a.available, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="amount" className="field-label">
                {p.amount}
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                min={selected?.minAmount ?? 1}
                max={selected?.available ?? undefined}
                step="0.01"
                required
                disabled={!selected?.eligible}
                className="field-input disabled:opacity-50"
              />
              {selected && (
                <p className="mt-1 text-xs text-white/40">
                  {p.eligible}: {formatCurrency(selected.available, locale)} ·{' '}
                  {p.split.replace('{percent}', String(selected.profitSplit))} ·{' '}
                  {p.minimum}: {formatCurrency(selected.minAmount, locale)}
                </p>
              )}
              {selected && selected.refundAmount > 0 && (
                <p className="mt-1 text-xs text-brand-300">
                  {p.blocks.refund.replace(
                    '{amount}',
                    formatCurrency(selected.refundAmount, locale),
                  )}
                </p>
              )}
              {selected && (
                <p className="mt-1 text-xs text-white/40">
                  {p.blocks.nextPayout.replace(
                    '{date}',
                    formatDate(selected.nextPayoutAt, locale),
                  )}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="method" className="field-label">
                {p.method}
              </label>
              <select id="method" name="method" className="field-input">
                <option value="usdt">
                  {locale === 'fa' ? 'تتر — شبکه BEP20' : 'USDT — BEP20'}
                </option>
                <option value="sheba">
                  {locale === 'fa' ? 'شبا (ریالی)' : 'Sheba (IRR)'}
                </option>
                <option value="card">
                  {locale === 'fa' ? 'کارت بانکی (ریالی)' : 'Bank card (IRR)'}
                </option>
              </select>
            </div>
            <div>
              <label htmlFor="wallet" className="field-label">
                {p.wallet}
              </label>
              <input id="wallet" name="wallet" required className="field-input" />
            </div>
            {blocked && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {blocked}
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !selected?.eligible}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? dict.dashboard.buy.processing : p.request}
            </button>
          </form>
        )}
      </div>

      {/* History */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white">{p.history}</h3>
        {payouts.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">{p.noPayouts}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-start text-xs text-white/40">
                  <th className="pb-3 text-start font-medium">{p.amount}</th>
                  <th className="pb-3 text-start font-medium">{p.method}</th>
                  <th className="pb-3 text-start font-medium">
                    {dict.admin.table.status}
                  </th>
                  <th className="pb-3 text-start font-medium">
                    {dict.admin.table.date}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {payouts.map((pay) => (
                  <tr key={pay.id}>
                    <td className="py-3 font-mono font-semibold text-white">
                      {formatCurrency(pay.amount, locale)}
                    </td>
                    <td className="py-3 text-white/60">{pay.method}</td>
                    <td className="py-3">
                      <StatusBadge
                        status={pay.status}
                        label={
                          dict.status[
                            pay.status as keyof typeof dict.status
                          ] ?? pay.status
                        }
                      />
                    </td>
                    <td className="py-3 text-white/50">
                      {formatDate(pay.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
