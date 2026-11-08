'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export type WalletT = {
  balance: string;
  topUp: string;
  amount: string;
  start: string;
  starting: string;
  history: string;
  empty: string;
  sendExactly: string;
  toAddress: string;
  network: string;
  pendingNote: string;
  close: string;
  failed: string;
  minAmount: string;
  types: Record<string, string>;
};

type Entry = {
  id: string;
  amount: number;
  type: string;
  note: string;
  balanceAfter: number;
  createdAt: string;
};

type Crypto = { address: string; amount: string; network: string };

export function WalletPanel({
  locale,
  balance,
  entries,
  t,
}: {
  locale: Locale;
  balance: number;
  entries: Entry[];
  t: WalletT;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('50');
  const [busy, setBusy] = useState(false);
  const [crypto, setCrypto] = useState<Crypto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 10) return setError(t.minAmount);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'CRYPTO') throw new Error('failed');
      setCrypto(data.crypto);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        <div className="card p-6">
          <p className="text-sm text-white/50">{t.balance}</p>
          <p className="mt-2 font-display text-4xl font-extrabold text-brand-300">
            {formatCurrency(balance, locale)}
          </p>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white">{t.topUp}</h3>

          {crypto ? (
            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-ink-900/60 p-4 text-sm">
              <div>
                <p className="text-xs text-white/40">{t.sendExactly}</p>
                <p className="font-mono text-lg font-bold text-brand-300">
                  {crypto.amount} USDT
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40">
                  {t.network}: {crypto.network}
                </p>
                <p className="text-xs text-white/40">{t.toAddress}</p>
                <p className="mt-1 break-all rounded-lg bg-black/40 p-2 font-mono text-xs text-white/80">
                  {crypto.address}
                </p>
              </div>
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                {t.pendingNote}
              </p>
              <button
                type="button"
                onClick={() => setCrypto(null)}
                className="btn-ghost w-full py-2 text-xs"
              >
                {t.close}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="topup" className="field-label">
                  {t.amount}
                </label>
                <input
                  id="topup"
                  type="number"
                  min={10}
                  step="1"
                  dir="ltr"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="field-input"
                />
              </div>
              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="btn-primary w-full"
              >
                {busy ? t.starting : t.start}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white">{t.history}</h3>
        {entries.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">{t.empty}</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.05]">
            {entries.map((e) => {
              const credit = e.amount > 0;
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/85">
                      {t.types[e.type] ?? e.type}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {e.note || '—'} · {formatDate(e.createdAt, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        credit ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {credit ? '+' : '−'}
                      {formatCurrency(Math.abs(e.amount), locale)}
                    </p>
                    <p className="font-mono text-[0.7rem] text-white/35">
                      {formatCurrency(e.balanceAfter, locale)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
