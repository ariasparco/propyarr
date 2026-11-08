'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type WalletAdjustT = {
  adjust: string;
  amount: string;
  amountHint: string;
  note: string;
  notePlaceholder: string;
  submit: string;
  saving: string;
  failed: string;
  insufficient: string;
  cancel: string;
};

/** Credits or debits one trader's store credit. Negative amounts take money out. */
export function WalletAdjust({
  userId,
  balance,
  t,
}: {
  userId: string;
  balance: number;
  t: WalletAdjustT;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch('/api/admin/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: Number(fd.get('amount')),
          note: String(fd.get('note') ?? ''),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === 'insufficient_balance' ? t.insufficient : t.failed,
        );
        return;
      }
      form.reset();
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
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 transition-colors hover:bg-white/5"
      >
        {t.adjust}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-56 space-y-2 rounded-lg border border-line bg-ink-900/60 p-3"
    >
      <div>
        <label className="field-label">{t.amount}</label>
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          dir="ltr"
          placeholder="25 / -25"
          className="field-input py-2 text-sm"
        />
        <p className="mt-1 text-[0.65rem] text-white/35">{t.amountHint}</p>
      </div>
      <input
        name="note"
        placeholder={t.notePlaceholder}
        className="field-input py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="btn-primary flex-1 py-2 text-xs"
        >
          {busy ? t.saving : t.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost py-2 text-xs"
        >
          {t.cancel}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </form>
  );
}
