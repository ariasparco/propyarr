'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';

export function BuyButton({
  challengeId,
  locale,
  label,
  processingLabel,
  popular,
}: {
  challengeId: string;
  locale: Locale;
  label: string;
  processingLabel: string;
  popular: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function buy() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, paymentMethod: 'mock' }),
      });
      if (!res.ok) throw new Error('failed');
      router.push(path(locale, '/dashboard/accounts'));
      router.refresh();
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={buy}
        disabled={loading}
        className={popular ? 'btn-primary w-full' : 'btn-ghost w-full'}
      >
        {loading ? processingLabel : label}
      </button>
      {error && (
        <p className="text-center text-xs text-red-300">✕</p>
      )}
    </div>
  );
}
