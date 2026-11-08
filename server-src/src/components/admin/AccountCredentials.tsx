'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shows and corrects the login details a terminal signs in with.
 *
 * These were entered by hand and had no way to be fixed afterwards, which is
 * how three accounts ended up with passwords that no longer worked. MetaTrader
 * does not report that as an error: the login quietly fails and the broker's
 * demo server issues a brand new account instead, so the terminal runs happily
 * against an account nobody asked about. Nothing downstream notices until
 * someone reads the terminal's own log.
 *
 * The password is never sent to the browser — only whether one is stored — so
 * opening this panel cannot leak it. Leaving a field blank keeps what is
 * already saved.
 */
export type CredentialState = {
  accountNumber: string;
  server: string;
  hasPassword: boolean;
  hasInvestorPassword: boolean;
  /** Set when the terminal is signed into a different account than this one. */
  connectedAs?: string | null;
};

export type CredentialsT = {
  edit: string;
  title: string;
  accountNumber: string;
  server: string;
  password: string;
  investorPassword: string;
  passwordHint: string;
  investorHint: string;
  keepBlank: string;
  stored: string;
  notStored: string;
  save: string;
  saving: string;
  cancel: string;
  saved: string;
  failed: string;
  mismatch: string;
};

export function AccountCredentials({
  accountId,
  state,
  t,
}: {
  accountId: string;
  state: CredentialState;
  t: CredentialsT;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [accountNumber, setAccountNumber] = useState(state.accountNumber);
  const [server, setServer] = useState(state.server);
  const [password, setPassword] = useState('');
  const [investorPassword, setInvestorPassword] = useState('');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          action: 'CREDENTIALS',
          accountNumber: accountNumber.trim(),
          server: server.trim(),
          // Blank means "leave the stored one alone" rather than "clear it" —
          // otherwise opening the form and saving would wipe both passwords.
          ...(password.trim() ? { password: password.trim() } : {}),
          ...(investorPassword.trim()
            ? { investorPassword: investorPassword.trim() }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error === 'duplicate_number' ? t.mismatch : t.failed);
        return;
      }
      setDone(true);
      setPassword('');
      setInvestorPassword('');
      router.refresh();
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 1600);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-sky-500/30 px-2 py-0.5 text-[0.65rem] font-medium text-sky-300 transition-colors hover:bg-sky-500/10"
        >
          {t.edit}
        </button>
        {/* The terminal being on a different account is the failure this panel
            exists to fix, so it is called out rather than left in a log file. */}
        {state.connectedAs && state.connectedAs !== state.accountNumber && (
          <span
            className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[0.62rem] text-red-300"
            title={t.mismatch}
          >
            ⚠ #{state.connectedAs}
          </span>
        )}
        {!state.hasInvestorPassword && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.62rem] text-amber-300">
            {t.notStored}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 w-full max-w-xs space-y-2 rounded-xl border border-white/10 bg-ink-900/80 p-3">
      <p className="text-[0.7rem] font-medium text-white/80">{t.title}</p>

      <label className="block">
        <span className="text-[0.62rem] text-white/45">{t.accountNumber}</span>
        <input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          dir="ltr"
          className="mt-0.5 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 font-mono text-xs text-white outline-none focus:border-sky-500/50"
        />
      </label>

      <label className="block">
        <span className="text-[0.62rem] text-white/45">{t.server}</span>
        <input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          dir="ltr"
          className="mt-0.5 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 font-mono text-xs text-white outline-none focus:border-sky-500/50"
        />
      </label>

      <label className="block">
        <span className="text-[0.62rem] text-white/45">
          {t.investorPassword}{' '}
          <span className={state.hasInvestorPassword ? 'text-emerald-300/70' : 'text-amber-300/70'}>
            ({state.hasInvestorPassword ? t.stored : t.notStored})
          </span>
        </span>
        <input
          value={investorPassword}
          onChange={(e) => setInvestorPassword(e.target.value)}
          placeholder={t.keepBlank}
          dir="ltr"
          autoComplete="off"
          className="mt-0.5 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 font-mono text-xs text-white outline-none placeholder:text-white/25 focus:border-sky-500/50"
        />
        <span className="text-[0.6rem] text-white/35">{t.investorHint}</span>
      </label>

      <label className="block">
        <span className="text-[0.62rem] text-white/45">
          {t.password}{' '}
          <span className={state.hasPassword ? 'text-emerald-300/70' : 'text-white/35'}>
            ({state.hasPassword ? t.stored : t.notStored})
          </span>
        </span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.keepBlank}
          dir="ltr"
          autoComplete="off"
          className="mt-0.5 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 font-mono text-xs text-white outline-none placeholder:text-white/25 focus:border-sky-500/50"
        />
        <span className="text-[0.6rem] text-white/35">{t.passwordHint}</span>
      </label>

      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[0.65rem] text-red-300">
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[0.65rem] text-emerald-300">
          {t.saved}
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={busy || !accountNumber.trim()}
          className="rounded-lg border border-emerald-500/35 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {busy ? t.saving : t.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setPassword('');
            setInvestorPassword('');
            setAccountNumber(state.accountNumber);
            setServer(state.server);
          }}
          disabled={busy}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[0.68rem] text-white/50 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
