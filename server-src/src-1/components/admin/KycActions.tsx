'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function KycActions({
  kycId,
  status,
  labels,
}: {
  kycId: string;
  status: string;
  labels: { approve: string; reject: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: 'APPROVE' | 'REJECT') {
    setBusy(true);
    try {
      await fetch('/api/admin/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kycId, action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'PENDING')
    return <span className="text-xs text-white/30">—</span>;

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={() => act('APPROVE')}
        disabled={busy}
        className="flex-1 rounded-lg border border-brand-500/30 px-2.5 py-1.5 text-xs font-medium text-brand-200 transition-colors hover:bg-brand-500/10 disabled:opacity-50"
      >
        {labels.approve}
      </button>
      <button
        type="button"
        onClick={() => act('REJECT')}
        disabled={busy}
        className="flex-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        {labels.reject}
      </button>
    </div>
  );
}
