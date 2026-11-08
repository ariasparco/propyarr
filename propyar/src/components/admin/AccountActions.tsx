'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = 'PASS' | 'FUND' | 'DISABLE' | 'FAIL';

export type ActionLabels = {
  advance: string;
  fund: string;
  disable: string;
  fail: string;
  sync?: string;
  reason: ReasonT;
};

export type ReasonT = {
  failTitle: string;
  disableTitle: string;
  hint: string;
  optionalHint: string;
  label: string;
  placeholder: string;
  presets: string[];
  confirm: string;
  saving: string;
  cancel: string;
  required: string;
  failed: string;
};

export function AccountActions({
  accountId,
  status,
  labels,
}: {
  accountId: string;
  status: string;
  labels: ActionLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Which of the two closing actions is waiting on a written reason, if any.
  const [asking, setAsking] = useState<'FAIL' | 'DISABLE' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function act(action: Action, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          action,
          ...(reason ? { note: reason } : {}),
        }),
      });
      if (!res.ok) {
        setError(labels.reason.failed);
        return;
      }
      setAsking(null);
      setNote('');
      router.refresh();
    } catch {
      setError(labels.reason.failed);
    } finally {
      setBusy(false);
    }
  }

  function open(action: 'FAIL' | 'DISABLE') {
    setAsking(action);
    setNote('');
    setError(null);
  }

  const done = status === 'DISABLED';

  // No sync pill here.
  //
  // This row used to carry a third sync button beside the panel's own "check"
  // and "live sync" pair — three controls for two behaviours, and no way to tell
  // from the outside which one actually refreshed the figures. The panel's
  // single button now pulls the terminal and runs every rule; these pills are
  // for decisions only.
  if (asking) {
    // Failing an account by hand is the one verdict the engine cannot explain
    // afterwards, so the reason is collected before it is recorded — not
    // offered as an afterthought the admin can click past.
    const mandatory = asking === 'FAIL';
    const t = labels.reason;
    const trimmed = note.trim();
    return (
      <div className="w-full max-w-xs space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
        <p className="text-[0.7rem] font-medium text-amber-200">
          {mandatory ? t.failTitle : t.disableTitle}
        </p>
        <p className="text-[0.63rem] leading-relaxed text-amber-200/60">
          {mandatory ? t.hint : t.optionalHint}
        </p>

        {/* The reasons that come up over and over, one click away. An admin
            filling this in fifty times a week writes less each time; a preset
            keeps the wording consistent for the trader reading it. */}
        <div className="flex flex-wrap gap-1">
          {t.presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setNote(p)}
              className="rounded-lg border border-white/10 px-1.5 py-0.5 text-[0.6rem] text-white/50 transition-colors hover:border-amber-500/40 hover:text-amber-200"
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
            className="mt-0.5 w-full resize-y rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 text-xs leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-amber-500/50"
          />
        </label>

        {mandatory && trimmed.length > 0 && trimmed.length < 3 && (
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
            onClick={() => act(asking, trimmed || undefined)}
            disabled={busy || (mandatory && trimmed.length < 3)}
            className="rounded-lg border border-amber-500/40 px-2.5 py-1 text-[0.68rem] font-medium text-amber-300 transition-colors hover:bg-amber-500/15 disabled:opacity-40"
          >
            {busy ? t.saving : t.confirm}
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            disabled={busy}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[0.68rem] text-white/50 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {status === 'ACTIVE' && (
        <Pill onClick={() => act('PASS')} disabled={busy} tone="brand">
          {labels.advance}
        </Pill>
      )}
      {status !== 'FUNDED' && !done && (
        <Pill onClick={() => act('FUND')} disabled={busy} tone="gold">
          {labels.fund}
        </Pill>
      )}
      {!done && status !== 'FAILED' && (
        <Pill onClick={() => open('FAIL')} disabled={busy} tone="amber">
          {labels.fail}
        </Pill>
      )}
      {!done && (
        <Pill onClick={() => open('DISABLE')} disabled={busy} tone="red">
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
