'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shows who an account belongs to, and lets an admin correct it.
 *
 * The owner is not cosmetic: the trader's dashboard, their payouts and the name
 * printed on their achievement certificate all read it. Accounts that arrived
 * through the old auto-provisioning path were attached to an admin user, which
 * is what put the admin's name on traders' certificates.
 */
export function AccountOwner({
  accountId,
  email,
  name,
  isAdminOwned,
}: {
  accountId: string;
  email: string;
  name: string;
  isAdminOwned: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          action: 'ASSIGN',
          userEmail: value.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          data?.error === 'user_not_found'
            ? 'کاربری با این ایمیل پیدا نشد.'
            : 'انتقال انجام نشد.',
        );
        return;
      }
      setEditing(false);
      setValue('');
      router.refresh();
    } catch {
      setError('خطا در ارتباط با سرور.');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="email"
            dir="ltr"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') assign();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="trader@email.com"
            className="w-44 rounded-lg border border-white/10 bg-ink-900 px-2 py-1 font-mono text-[0.7rem] text-white/80 outline-none focus:border-brand-500/50"
          />
          <button
            type="button"
            onClick={assign}
            disabled={busy}
            className="rounded-lg border border-brand-500/30 px-2 py-1 text-[0.7rem] text-brand-200 hover:bg-brand-500/10 disabled:opacity-50"
          >
            {busy ? '…' : 'انتقال'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="px-1 text-[0.7rem] text-white/40 hover:text-white/70"
          >
            ✕
          </button>
        </div>
        {error && <span className="text-[0.65rem] text-red-300">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-white/60">{email}</span>
      {/* Called out rather than left to be noticed: an admin-owned account
          silently blocks that trader's certificate from ever being issued. */}
      {isAdminOwned ? (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[0.6rem] text-amber-300">
          بدون مالک واقعی
        </span>
      ) : (
        <span className="text-[0.65rem] text-white/35">{name}</span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[0.65rem] text-brand-300/70 underline-offset-2 hover:underline"
      >
        تغییر مالک
      </button>
    </div>
  );
}
