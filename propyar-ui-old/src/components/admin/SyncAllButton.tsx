'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SyncAllButton({
  label,
  successMsg,
}: {
  label: string;
  successMsg: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncAll() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/accounts/sync-all', {
        method: 'POST',
      });
      if (res.ok) {
        setMessage(successMsg);
        router.refresh();
      }
    } catch {
      setMessage('خطا در برقراری ارتباط');
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className="text-xs text-emerald-300 animate-fade-in font-medium">
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={syncAll}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
      >
        <svg
          aria-hidden
          className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        <span>{busy ? 'در حال همگام‌سازی…' : label}</span>
      </button>
    </div>
  );
}
