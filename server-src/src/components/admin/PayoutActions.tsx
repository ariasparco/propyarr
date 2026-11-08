'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = 'APPROVE' | 'REJECT' | 'MARK_PAID';

export function PayoutActions({
  payoutId,
  status,
  labels,
}: {
  payoutId: string;
  status: string;
  labels: { approve: string; reject: string; markPaid: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: Action) {
    setBusy(true);
    try {
      await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId, action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === 'PAID' || status === 'REJECTED') {
    return <span className="text-xs text-white/30">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {status === 'REQUESTED' && (
        <Pill onClick={() => act('APPROVE')} disabled={busy} tone="brand">
          {labels.approve}
        </Pill>
      )}
      {status === 'APPROVED' && (
        <Pill onClick={() => act('MARK_PAID')} disabled={busy} tone="brand">
          {labels.markPaid}
        </Pill>
      )}
      <Pill onClick={() => act('REJECT')} disabled={busy} tone="red">
        {labels.reject}
      </Pill>
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
  tone: 'brand' | 'red';
}) {
  const tones = {
    brand: 'border-brand-500/30 text-brand-200 hover:bg-brand-500/10',
    red: 'border-red-500/30 text-red-300 hover:bg-red-500/10',
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
