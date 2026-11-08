'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dictionary } from '@/i18n';

type KycT = Dictionary['kyc'];

const MAX_BYTES = 2 * 1024 * 1024;

// Same checksum the API applies, so a typo is caught before the upload.
function validCode(raw: string): boolean {
  const code = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim();
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 9).reduce((s, d, i) => s + d * (10 - i), 0);
  const r = sum % 11;
  return digits[9] === (r < 2 ? r : 11 - r);
}

/**
 * Identity verification: both sides of the national card plus its code.
 * Purchases stay locked until staff approve it.
 */
export function KycForm({
  status,
  rejectReason,
  t,
}: {
  status: string;
  rejectReason: string | null;
  t: KycT;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = status === 'NONE' || status === 'REJECTED';
  const step = status === 'APPROVED' ? 2 : status === 'PENDING' ? 1 : 0;

  function pick(set: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        setMsg(t.tooBig);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => set(String(reader.result));
      reader.readAsDataURL(file);
      setMsg(null);
    };
  }

  async function submit() {
    if (!validCode(code)) return setMsg(t.invalidCode);
    if (!front || !back) return setMsg(t.needBoth);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: 'melli',
          nationalCode: code,
          image: front,
          imageBack: back,
        }),
      });
      if (res.ok) router.refresh();
      else setMsg(t.failed);
    } catch {
      setMsg(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <ol className="grid grid-cols-3 gap-2">
        {t.steps.map((label, i) => (
          <li
            key={label}
            className={
              'rounded-xl border px-3 py-3 text-center text-xs font-semibold sm:text-sm ' +
              (i < step || (i === step && status === 'APPROVED')
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                : i === step
                  ? 'border-gold-400/50 bg-gold-400/10 text-gold-600'
                  : 'border-white/10 text-white/45')
            }
          >
            <span className="mb-1 block text-base">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {status === 'PENDING' && (
        <p className="rounded-xl border border-gold-400/40 bg-gold-400/10 p-4 text-sm text-white/80">
          {t.pendingText}
        </p>
      )}
      {status === 'APPROVED' && (
        <p className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-4 text-sm text-brand-300">
          {t.approvedText}
        </p>
      )}
      {status === 'REJECTED' && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
          <p className="font-semibold">{t.statusRejected}</p>
          {rejectReason && (
            <p className="mt-1">
              {t.rejectReason}: {rejectReason}
            </p>
          )}
        </div>
      )}

      {canSubmit && (
        <div className="card space-y-5 p-6">
          <p className="text-sm leading-relaxed text-white/65">{t.desc}</p>

          <div>
            <label htmlFor="nationalCode" className="field-label">
              {t.nationalCode}
            </label>
            <input
              id="nationalCode"
              inputMode="numeric"
              dir="ltr"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="field-input text-center tracking-[0.3em]"
              placeholder="0000000000"
            />
            <p className="mt-1 text-xs text-white/45">{t.nationalCodeHint}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Upload label={t.front} choose={t.choose} value={front} onChange={pick(setFront)} id="kyc-front" />
            <Upload label={t.back} choose={t.choose} value={back} onChange={pick(setBack)} id="kyc-back" />
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary w-full"
          >
            {busy ? t.submitting : t.submit}
          </button>
          {msg && <p className="text-center text-sm text-red-500">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function Upload({
  id,
  label,
  choose,
  value,
  onChange,
}: {
  id: string;
  label: string;
  choose: string;
  value: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="group flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-brand-500/30 bg-brand-500/[0.04] p-4 text-center transition-colors hover:border-brand-500/60"
    >
      <span className="text-sm font-semibold text-white">{label}</span>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-32 w-full rounded-lg object-contain" />
      ) : (
        <span className="flex h-32 w-full items-center justify-center rounded-lg text-xs text-white/45">
          {choose}
        </span>
      )}
      <input id={id} type="file" accept="image/*" className="sr-only" onChange={onChange} />
    </label>
  );
}
