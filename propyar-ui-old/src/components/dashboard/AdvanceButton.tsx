'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type AdvanceT = {
  requestPhase2: string;
  requestFunded: string;
  requesting: string;
  requested: string;
  failed: string;
};

export function AdvanceButton({
  accountId,
  phase,
  pending,
  t,
}: {
  accountId: string;
  phase: string;
  pending: boolean;
  t: AdvanceT;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(pending);
  const [error, setError] = useState(false);

  async function request() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/accounts/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error('failed');
      setSent(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <span className="me-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 align-middle" />
        {t.requested}
      </div>
    );
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={request}
        disabled={busy}
        className="btn-primary w-full disabled:opacity-70 sm:w-auto sm:px-8"
      >
        {busy
          ? t.requesting
          : phase === 'PHASE_1'
            ? t.requestPhase2
            : t.requestFunded}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-300">{t.failed}</p>
      )}
    </div>
  );
}
