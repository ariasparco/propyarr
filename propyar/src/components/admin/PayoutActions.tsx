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
  labels: {
    approve: string;
    reject: string;
    markPaid: string;
    txHash: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [network, setNetwork] = useState('BEP20');
  const [error, setError] = useState(false);

  async function act(action: Action) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payoutId,
          action,
          ...(action === 'MARK_PAID' ? { txHash: txHash.trim(), network } : {}),
        }),
      });
      setError(!res.ok);
      if (res.ok) router.refresh();
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
        <div className="flex w-full flex-wrap gap-1.5">
          <input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder={labels.txHash}
            dir="ltr"
            className={`field-input min-w-[14rem] flex-1 py-1 font-mono text-xs ${error ? 'border-red-500/60' : ''}`}
          />
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="field-input w-auto py-1 text-xs"
          >
            <option value="BEP20">BEP20</option>
            <option value="TRC20">TRC20</option>
            <option value="ERC20">ERC20</option>
          </select>
          <Pill
            onClick={() => act('MARK_PAID')}
            disabled={busy || !txHash.trim()}
            tone="brand"
          >
            {labels.markPaid}
          </Pill>
        </div>
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
