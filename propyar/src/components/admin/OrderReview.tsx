'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type ReviewT = {
  title: string;
  hint: string;
  approve: string;
  reject: string;
  label: string;
  placeholder: string;
  approvePresets: string[];
  rejectPresets: string[];
  failAccount: string;
  failAccountHint: string;
  confirmApprove: string;
  confirmReject: string;
  saving: string;
  cancel: string;
  required: string;
  failed: string;
  approved: string;
  rejected: string;
  nextStep: string;
};

/**
 * The verdict on a trader's request to move to the next stage.
 *
 * Approving does not hand over an account by itself — it records the decision
 * and leaves the request in the queue, where the "complete order" form issues
 * the next login. Keeping those two steps apart is deliberate: the judgement is
 * made from the account's history, the credentials are created at the broker,
 * and they rarely happen in the same minute.
 */
export function OrderReview({
  orderId,
  reviewStatus,
  reviewNote,
  t,
}: {
  orderId: string;
  reviewStatus: string | null;
  reviewNote: string | null;
  t: ReviewT;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [note, setNote] = useState('');
  const [failAccount, setFailAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/orders/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          decision: open,
          note: note.trim(),
          failAccount: open === 'REJECT' && failAccount,
        }),
      });
      if (!res.ok) {
        setError(t.failed);
        return;
      }
      setOpen(null);
      setNote('');
      setFailAccount(false);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  // Already judged: show what was decided and what was said, so a second admin
  // picking the row up does not review it twice.
  if (reviewStatus) {
    const good = reviewStatus === 'APPROVED';
    return (
      <div
        className={
          'mt-2 rounded-xl border px-2.5 py-2 ' +
          (good
            ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
            : 'border-red-500/25 bg-red-500/[0.06]')
        }
      >
        <p
          className={
            'text-[0.68rem] font-semibold ' +
            (good ? 'text-emerald-300' : 'text-red-300')
          }
        >
          {good ? t.approved : t.rejected}
        </p>
        {reviewNote && (
          <p className="mt-1 whitespace-pre-wrap text-[0.65rem] leading-relaxed text-white/50">
            {reviewNote}
          </p>
        )}
        {good && (
          <p className="mt-1 text-[0.63rem] text-white/35">{t.nextStep}</p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-[0.65rem] font-medium text-white/45">{t.title}</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen('APPROVE');
              setNote('');
              setError(null);
            }}
            className="rounded-lg border border-emerald-500/35 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10"
          >
            {t.approve}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen('REJECT');
              setNote('');
              setError(null);
            }}
            className="rounded-lg border border-red-500/35 px-2.5 py-1 text-[0.68rem] font-medium text-red-300 transition-colors hover:bg-red-500/10"
          >
            {t.reject}
          </button>
        </div>
      </div>
    );
  }

  const approving = open === 'APPROVE';
  const presets = approving ? t.approvePresets : t.rejectPresets;
  const trimmed = note.trim();

  return (
    <div
      className={
        'mt-2 w-full max-w-xs space-y-2 rounded-xl border p-3 ' +
        (approving
          ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
          : 'border-red-500/30 bg-red-500/[0.06]')
      }
    >
      <p className="text-[0.7rem] font-medium text-white/80">
        {approving ? t.approve : t.reject}
      </p>
      <p className="text-[0.63rem] leading-relaxed text-white/45">{t.hint}</p>

      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setNote(p)}
            className="rounded-lg border border-white/10 px-1.5 py-0.5 text-[0.6rem] text-white/50 transition-colors hover:border-white/30 hover:text-white/80"
          >
            {p}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-[0.62rem] text-white/45">{t.label}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t.placeholder}
          className="mt-0.5 w-full resize-y rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 text-xs leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-white/30"
        />
      </label>

      {/* A refusal is not always a breach. "Not there yet, keep trading" leaves
          the account running; a rule violation closes it. */}
      {!approving && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={failAccount}
            onChange={(e) => setFailAccount(e.target.checked)}
            className="mt-0.5 accent-red-500"
          />
          <span className="text-[0.63rem] leading-relaxed text-white/60">
            {t.failAccount}
            <span className="block text-white/35">{t.failAccountHint}</span>
          </span>
        </label>
      )}

      {trimmed.length > 0 && trimmed.length < 3 && (
        <p className="text-[0.62rem] text-amber-300/70">{t.required}</p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[0.65rem] text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={send}
          disabled={busy || trimmed.length < 3}
          className={
            'rounded-lg border px-2.5 py-1 text-[0.68rem] font-medium transition-colors disabled:opacity-40 ' +
            (approving
              ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15'
              : 'border-red-500/40 text-red-300 hover:bg-red-500/15')
          }
        >
          {busy ? t.saving : approving ? t.confirmApprove : t.confirmReject}
        </button>
        <button
          type="button"
          onClick={() => setOpen(null)}
          disabled={busy}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[0.68rem] text-white/50 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
