'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type AdvanceT = {
  requestPhase2: string;
  requestFunded: string;
  requesting: string;
  requested: string;
  failed: string;
  title: string;
  hint: string;
  pending: string;
  pendingHint: string;
  approved: string;
  approvedHint: string;
  rejected: string;
  adminNote: string;
  tryAgain: string;
};

export type AdvanceRequest = {
  state: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  at: string;
};

/**
 * Where a trader asks to be moved to the next stage, and reads the answer.
 *
 * The stage is decided by a person, so this has to show more than "sent": what
 * was decided and what was said about it. A refusal that leaves the account
 * running is not the end of the road — the button comes back so the trader can
 * ask again once they have addressed whatever was written here.
 */
export function AdvanceButton({
  accountId,
  phase,
  request,
  t,
}: {
  accountId: string;
  /** The stage being requested next: PHASE_2 or FUNDED. */
  phase: string;
  request: AdvanceRequest | null;
  t: AdvanceT;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function send() {
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

  const state = sent ? 'PENDING' : (request?.state ?? null);

  if (state === 'PENDING') {
    return (
      <Shell title={t.title}>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-200">
            <span className="me-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 align-middle" />
            {t.pending}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/60">
            {t.pendingHint}
          </p>
        </div>
      </Shell>
    );
  }

  if (state === 'APPROVED') {
    return (
      <Shell title={t.title}>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-200">{t.approved}</p>
          {request?.note && <Note label={t.adminNote} text={request.note} tone="emerald" />}
          <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/60">
            {t.approvedHint}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={t.title}>
      {/* A refusal that left the account running still shows the reasoning, and
          the button underneath it so the trader can come back. */}
      {state === 'REJECTED' && (
        <div className="mb-3 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3">
          <p className="text-sm font-medium text-red-200">{t.rejected}</p>
          {request?.note && <Note label={t.adminNote} text={request.note} tone="red" />}
          <p className="mt-1.5 text-xs leading-relaxed text-red-100/50">
            {t.tryAgain}
          </p>
        </div>
      )}

      <p className="mb-2 text-xs leading-relaxed text-white/45">{t.hint}</p>
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="btn-primary w-full disabled:opacity-70 sm:w-auto sm:px-8"
      >
        {busy
          ? t.requesting
          : phase === 'PHASE_2'
            ? t.requestPhase2
            : t.requestFunded}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{t.failed}</p>}
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 border-t border-white/[0.06] pt-5">
      <p className="mb-2.5 text-sm font-semibold text-white/85">{title}</p>
      {children}
    </div>
  );
}

function Note({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: 'emerald' | 'red';
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-950/25 text-emerald-100/85'
      : 'border-red-500/20 bg-red-950/25 text-red-100/85';
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 ${cls}`}>
      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
    </div>
  );
}
