'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type DiscountT = {
  create: string;
  code: string;
  percent: string;
  plan: string;
  allPlans: string;
  maxUses: string;
  unlimited: string;
  expires: string;
  submit: string;
  saving: string;
  exists: string;
  failed: string;
  existing: string;
  none: string;
  used: string;
  enable: string;
  disable: string;
  remove: string;
  active: string;
  inactive: string;
  inBanner: string;
  showInBanner: string;
  bannerLabel: string;
  bannerOn: string;
  bannerOff: string;
};

export type DiscountRow = {
  id: string;
  code: string;
  percent: number;
  planName: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  showInBanner: boolean;
  bannerLabel: string | null;
};

export function DiscountManager({
  rows,
  plans,
  t,
}: {
  rows: DiscountRow[];
  plans: Array<{ id: string; label: string }>;
  t: DiscountT;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const expires = String(fd.get('expiresAt') ?? '');
    const maxUses = String(fd.get('maxUses') ?? '');
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: String(fd.get('code') ?? ''),
          percent: Number(fd.get('percent')),
          challengeId: String(fd.get('challengeId') ?? '') || null,
          maxUses: maxUses ? Number(maxUses) : null,
          // A date input gives a plain day; treat it as end of that day.
          expiresAt: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null,
          showInBanner: fd.get('showInBanner') === 'on',
          bannerLabel: String(fd.get('bannerLabel') ?? '').trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === 'code_exists' ? t.exists : t.failed);
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: 'TOGGLE' | 'DELETE' | 'BANNER') {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error('failed');
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card space-y-4 p-6">
        <h3 className="text-lg font-semibold text-white">{t.create}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="code" className="field-label">
              {t.code}
            </label>
            <input
              id="code"
              name="code"
              required
              dir="ltr"
              className="field-input py-2 font-mono uppercase"
            />
          </div>
          <div>
            <label htmlFor="percent" className="field-label">
              {t.percent}
            </label>
            <input
              id="percent"
              name="percent"
              type="number"
              min={1}
              max={100}
              defaultValue={10}
              required
              dir="ltr"
              className="field-input py-2"
            />
          </div>
          <div>
            <label htmlFor="challengeId" className="field-label">
              {t.plan}
            </label>
            <select id="challengeId" name="challengeId" className="field-input py-2">
              <option value="">{t.allPlans}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="maxUses" className="field-label">
              {t.maxUses}
            </label>
            <input
              id="maxUses"
              name="maxUses"
              type="number"
              min={1}
              dir="ltr"
              placeholder={t.unlimited}
              className="field-input py-2"
            />
          </div>
          <div>
            <label htmlFor="expiresAt" className="field-label">
              {t.expires}
            </label>
            <input
              id="expiresAt"
              name="expiresAt"
              type="date"
              dir="ltr"
              className="field-input py-2"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="showInBanner" className="h-4 w-4 accent-brand-500" />
            {t.showInBanner}
          </label>
          <input name="bannerLabel" placeholder={t.bannerLabel} className="field-input py-2" />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary px-8">
          {busy ? t.saving : t.submit}
        </button>
      </form>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white">{t.existing}</h3>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">{t.none}</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.05]">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-white">
                      {row.code}
                    </span>
                    <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-300">
                      {row.percent}%
                    </span>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs ' +
                        (row.active
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-white/[0.06] text-white/40')
                      }
                    >
                      {row.active ? t.active : t.inactive}
                    </span>
                    {row.showInBanner && (
                      <span className="rounded-full bg-gold-400/20 px-2 py-0.5 text-xs text-gold-600">
                        {t.inBanner}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    {row.planName ?? t.allPlans} · {t.used}: {row.usedCount}
                    {row.maxUses ? ` / ${row.maxUses}` : ''}
                    {row.expiresAt ? ` · ${row.expiresAt.slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => act(row.id, 'TOGGLE')}
                    disabled={busy}
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 transition-colors hover:bg-white/5"
                  >
                    {row.active ? t.disable : t.enable}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(row.id, 'BANNER')}
                    disabled={busy}
                    className="rounded-lg border border-gold-400/40 px-2.5 py-1 text-xs text-gold-600 transition-colors hover:bg-gold-400/10"
                  >
                    {row.showInBanner ? t.bannerOff : t.bannerOn}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(row.id, 'DELETE')}
                    disabled={busy}
                    className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    {t.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
