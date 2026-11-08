'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = 'APPROVE' | 'REJECT' | 'DELETE';

export function ReviewActions({
  reviewId,
  status,
  labels,
}: {
  reviewId: string;
  status: string;
  labels: { approve: string; reject: string; remove: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: Action) {
    setBusy(true);
    try {
      await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const btn =
    'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50';
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== 'APPROVED' && (
        <button type="button" disabled={busy} onClick={() => act('APPROVE')} className={`${btn} border-brand-500/30 text-brand-300 hover:bg-brand-500/10`}>
          {labels.approve}
        </button>
      )}
      {status === 'PENDING' && (
        <button type="button" disabled={busy} onClick={() => act('REJECT')} className={`${btn} border-amber-500/30 text-amber-500 hover:bg-amber-500/10`}>
          {labels.reject}
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => act('DELETE')} className={`${btn} border-red-500/30 text-red-500 hover:bg-red-500/10`}>
        {labels.remove}
      </button>
    </div>
  );
}
