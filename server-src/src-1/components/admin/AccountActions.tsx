'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = 'PASS' | 'FUND' | 'DISABLE' | 'FAIL';

export function AccountActions({
  accountId,
  status,
  labels,
}: {
  accountId: string;
  status: string;
  labels: { advance: string; fund: string; disable: string; fail: string; sync?: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function act(action: Action) {
    setBusy(true);
    try {
      await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      await fetch('/api/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  const done = status === 'DISABLED';

  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill
        onClick={sync}
        disabled={busy || syncing}
        tone="emerald"
      >
        <span className="flex items-center gap-1">
          <svg
            aria-hidden
            className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          {syncing ? '…' : (labels.sync ?? 'همگام‌سازی')}
        </span>
      </Pill>
      {status === 'ACTIVE' && (
        <Pill onClick={() => act('PASS')} disabled={busy || syncing} tone="brand">
          {labels.advance}
        </Pill>
      )}
      {status !== 'FUNDED' && !done && (
        <Pill onClick={() => act('FUND')} disabled={busy || syncing} tone="gold">
          {labels.fund}
        </Pill>
      )}
      {!done && status !== 'FAILED' && (
        <Pill onClick={() => act('FAIL')} disabled={busy || syncing} tone="amber">
          {labels.fail}
        </Pill>
      )}
      {!done && (
        <Pill onClick={() => act('DISABLE')} disabled={busy || syncing} tone="red">
          {labels.disable}
        </Pill>
      )}
    </div>
  );
}

function Pill({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: 'brand' | 'gold' | 'red' | 'amber' | 'emerald';
}) {
  const tones = {
    brand: 'border-brand-500/30 text-brand-200 hover:bg-brand-500/10',
    gold: 'border-gold-500/30 text-gold-300 hover:bg-gold-500/10',
    red: 'border-red-500/30 text-red-300 hover:bg-red-500/10',
    amber: 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10',
    emerald: 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${tones}`}
    >
      {children}
    </button>
  );
}
