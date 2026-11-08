'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Removes a trading account and everything recorded against it.
 *
 * Deliberately two steps: deleting an account also deletes its trades,
 * certificates and payout history, and none of that comes back. Confirmation is
 * typing the account number rather than clicking "yes" — a misclick on a table
 * row is exactly how the wrong customer's account would be erased.
 */
export type DeleteT = {
  remove: string;
  confirmTitle: string;
  confirmHint: string;
  typeNumber: string;
  confirm: string;
  deleting: string;
  cancel: string;
  failed: string;
};

export function AccountDelete({
  accountId,
  accountNumber,
  t,
}: {
  accountId: string;
  accountNumber: string;
  t: DeleteT;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'DELETE' }),
      });
      if (!res.ok) {
        setError(t.failed);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTyped('');
          setError(null);
        }}
        className="rounded-lg border border-red-500/25 px-2 py-0.5 text-[0.65rem] text-red-300/70 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
      >
        {t.remove}
      </button>
    );
  }

  return (
    <div className="w-full max-w-xs space-y-2 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3">
      <p className="text-[0.7rem] font-medium text-red-200">{t.confirmTitle}</p>
      <p className="text-[0.63rem] leading-relaxed text-red-200/60">
        {t.confirmHint}
      </p>
      <label className="block">
        <span className="text-[0.62rem] text-white/45">
          {t.typeNumber}: <span className="font-mono text-white/70">{accountNumber}</span>
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          dir="ltr"
          autoComplete="off"
          className="mt-0.5 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 font-mono text-xs text-white outline-none focus:border-red-500/50"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[0.65rem] text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={remove}
          disabled={busy || typed.trim() !== accountNumber}
          className="rounded-lg border border-red-500/40 px-2.5 py-1 text-[0.68rem] font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40"
        >
          {busy ? t.deleting : t.confirm}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[0.68rem] text-white/50 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
