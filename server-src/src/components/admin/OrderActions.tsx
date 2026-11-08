'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type OrderInfo = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  kyc: string;
  fulfillment: string;
  kind: string;
  sourceAccount: string | null;
  accountNumber: string | null;
  /** PENDING until the money is in. Card-to-card orders sit here until staff say so. */
  paymentStatus: string;
  /** What the customer owes, for the confirmation prompt. */
  amountToman: number;
};

type Labels = {
  viewInfo: string;
  complete: string;
  buyer: string;
  phone: string;
  country: string;
  kyc: string;
  stage: string;
  fromAccount: string;
  formTitle: string;
  login: string;
  password: string;
  server: string;
  investorPassword: string;
  investorHint: string;
  metaApiId: string;
  metaApiHint: string;
  submit: string;
  cancel: string;
  kinds: Record<string, string>;
  settle: string;
  settleTitle: string;
  settleHint: string;
  settleReference: string;
  settleConfirm: string;
  settleBusy: string;
  toman: string;
};

export function OrderActions({
  order,
  labels,
}: {
  order: OrderInfo;
  labels: Labels;
}) {
  const router = useRouter();
  const [info, setInfo] = useState(false);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [settling, setSettling] = useState(false);
  const [reference, setReference] = useState('');

  /**
   * Records that a card-to-card transfer arrived.
   *
   * Nothing else can: the money moves between two banks with the site nowhere
   * near it, so an order settled this way stays PENDING until a person who has
   * seen it says otherwise.
   */
  async function settle() {
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch('/api/admin/orders/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reference: reference.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      setSettling(false);
      setReference('');
      router.refresh();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          accountNumber: fd.get('accountNumber'),
          password: fd.get('password'),
          investorPassword: fd.get('investorPassword') || '',
          server: fd.get('server'),
          metaApiId: fd.get('metaApiId') || '',
          platform: 'MT5',
        }),
      });
      if (!res.ok) throw new Error('failed');
      router.refresh();
    } catch {
      setErr(true);
      setBusy(false);
    }
  }

  const pill =
    'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors';
  const stageLabel = labels.kinds[order.kind] ?? order.kind;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setInfo((v) => !v)}
          className={`${pill} border-white/15 text-white/70 hover:bg-white/5`}
        >
          {labels.viewInfo}
        </button>
        {/* Awaiting a transfer that happened off the site. Confirming it is
            what moves the order into the fulfilment queue. */}
        {order.paymentStatus === 'PENDING' && order.kind === 'PURCHASE' && (
          <button
            type="button"
            onClick={() => setSettling((v) => !v)}
            className={`${pill} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}
          >
            {labels.settle}
          </button>
        )}
        {order.fulfillment === 'REVIEW' && (
          <button
            type="button"
            onClick={() => setForm((v) => !v)}
            className={`${pill} border-brand-500/40 text-brand-200 hover:bg-brand-500/10`}
          >
            {labels.complete}
          </button>
        )}
        {order.fulfillment === 'COMPLETED' && order.accountNumber && (
          <span className="font-mono text-xs text-brand-300">
            #{order.accountNumber}
          </span>
        )}
      </div>

      {info && (
        <div className="space-y-0.5 rounded-lg border border-line bg-ink-900/60 p-2.5 text-xs text-white/70">
          <div className="font-medium text-white/85">{order.name}</div>
          <div className="font-mono text-white/50">{order.email}</div>
          <div>
            {labels.phone}:{' '}
            <span dir="ltr" className="font-mono">
              {order.phone || '—'}
            </span>
          </div>
          <div>
            {labels.country}: {order.country || '—'}
          </div>
          <div>
            {labels.kyc}: {order.kyc}
          </div>
          <div className="mt-1 border-t border-white/10 pt-1 text-brand-200">
            {labels.stage}: {stageLabel}
          </div>
          {order.sourceAccount && (
            <div className="text-white/50">
              {labels.fromAccount}:{' '}
              <span className="font-mono">#{order.sourceAccount}</span>
            </div>
          )}
        </div>
      )}

      {settling && order.paymentStatus === 'PENDING' && (
        <div className="w-full max-w-xs space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
          <p className="text-[0.7rem] font-medium text-emerald-200">
            {labels.settleTitle}
          </p>
          <p className="text-[0.63rem] leading-relaxed text-white/50">
            {labels.settleHint}{' '}
            <span className="font-mono text-white/80">
              {order.amountToman.toLocaleString('fa-IR')} {labels.toman}
            </span>
          </p>
          <label className="block">
            <span className="text-[0.62rem] text-white/45">
              {labels.settleReference}
            </span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              dir="ltr"
              autoComplete="off"
              className="mt-0.5 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 font-mono text-xs text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={settle}
              disabled={busy}
              className="rounded-lg border border-emerald-500/40 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
            >
              {busy ? labels.settleBusy : labels.settleConfirm}
            </button>
            <button
              type="button"
              onClick={() => setSettling(false)}
              disabled={busy}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[0.68rem] text-white/50 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}

      {form && order.fulfillment === 'REVIEW' && (
        <form
          onSubmit={complete}
          className="space-y-2 rounded-lg border border-line bg-ink-900/60 p-3"
        >
          <p className="text-xs font-semibold text-white">{labels.formTitle}</p>
          <p className="text-[0.7rem] text-brand-200">
            {labels.stage}: {stageLabel}
          </p>
          <input
            name="accountNumber"
            required
            placeholder={labels.login}
            className="field-input py-2 text-sm"
          />
          <input
            name="password"
            required
            placeholder={labels.password}
            className="field-input py-2 text-sm"
          />
          <input
            name="server"
            required
            placeholder={labels.server}
            className="field-input py-2 text-sm"
          />
          <input
            name="investorPassword"
            placeholder={labels.investorPassword}
            className="field-input py-2 text-sm"
          />
          <p className="text-[0.65rem] leading-relaxed text-white/35">
            {labels.investorHint}
          </p>
          <input
            name="metaApiId"
            placeholder={labels.metaApiId}
            className="field-input py-2 text-sm"
          />
          <p className="text-[0.65rem] leading-relaxed text-white/35">
            {labels.metaApiHint}
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="btn-primary flex-1 py-2 text-xs"
            >
              {labels.submit}
            </button>
            <button
              type="button"
              onClick={() => setForm(false)}
              className="btn-ghost py-2 text-xs"
            >
              {labels.cancel}
            </button>
          </div>
          {err && <p className="text-center text-xs text-red-300">✕</p>}
        </form>
      )}
    </div>
  );
}
