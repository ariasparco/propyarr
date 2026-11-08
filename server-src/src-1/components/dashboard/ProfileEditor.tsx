'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type KycT = {
  title: string;
  desc: string;
  docType: string;
  melli: string;
  shenasnameh: string;
  choose: string;
  submit: string;
  submitting: string;
  statusPending: string;
  statusApproved: string;
  statusRejected: string;
  statusNone: string;
  tooBig: string;
  failed: string;
};

export function ProfileEditor({
  initialPhone,
  kycStatus,
  t,
  labels,
}: {
  initialPhone: string;
  kycStatus: string;
  t: KycT;
  labels: { phone: string; save: string; saved: string };
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const [docType, setDocType] = useState<'melli' | 'shenasnameh'>('melli');
  const [image, setImage] = useState<string | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMsg, setKycMsg] = useState<string | null>(null);

  async function savePhone() {
    setSavingPhone(true);
    setPhoneSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) {
        setPhoneSaved(true);
        router.refresh();
      }
    } finally {
      setSavingPhone(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setKycMsg(t.tooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
    setKycMsg(null);
  }

  async function submitKyc() {
    if (!image) return;
    setKycLoading(true);
    setKycMsg(null);
    try {
      const res = await fetch('/api/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, image }),
      });
      if (res.ok) router.refresh();
      else setKycMsg(t.failed);
    } catch {
      setKycMsg(t.failed);
    } finally {
      setKycLoading(false);
    }
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    PENDING: { label: t.statusPending, cls: 'bg-amber-500/15 text-amber-300' },
    APPROVED: { label: t.statusApproved, cls: 'bg-brand-500/15 text-brand-300' },
    REJECTED: { label: t.statusRejected, cls: 'bg-red-500/15 text-red-300' },
    NONE: { label: t.statusNone, cls: 'bg-white/10 text-white/60' },
  };
  const s = statusMap[kycStatus] ?? statusMap.NONE;
  const canSubmit = kycStatus === 'NONE' || kycStatus === 'REJECTED';

  return (
    <div className="space-y-6">
      {/* Phone */}
      <div className="card p-6">
        <label htmlFor="phone" className="field-label">
          {labels.phone}
        </label>
        <div className="flex gap-2">
          <input
            id="phone"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneSaved(false);
            }}
            type="tel"
            dir="ltr"
            className="field-input"
          />
          <button
            type="button"
            onClick={savePhone}
            disabled={savingPhone}
            className="btn-primary shrink-0"
          >
            {phoneSaved ? labels.saved : labels.save}
          </button>
        </div>
      </div>

      {/* KYC */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">{t.title}</h3>
            <p className="mt-1 text-sm text-white/50">{t.desc}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}
          >
            {s.label}
          </span>
        </div>

        {canSubmit && (
          <div className="mt-5 space-y-4">
            <div>
              <p className="field-label">{t.docType}</p>
              <div className="flex gap-2">
                {(['melli', 'shenasnameh'] as const).map((d) => (
                  <label
                    key={d}
                    className={
                      'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors ' +
                      (docType === d
                        ? 'border-brand-500/50 bg-brand-500/10 text-white'
                        : 'border-white/10 text-white/70 hover:border-white/20')
                    }
                  >
                    <input
                      type="radio"
                      name="docType"
                      checked={docType === d}
                      onChange={() => setDocType(d)}
                      className="accent-brand-500"
                    />
                    {d === 'melli' ? t.melli : t.shenasnameh}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 bg-ink-850/60 px-4 py-6 text-sm text-white/60 hover:border-brand-500/40">
              <input
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
              />
              {t.choose}
            </label>

            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt="document preview"
                className="max-h-52 w-auto rounded-lg border border-white/10"
              />
            )}

            <button
              type="button"
              onClick={submitKyc}
              disabled={!image || kycLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {kycLoading ? t.submitting : t.submit}
            </button>
            {kycMsg && (
              <p className="text-center text-xs text-red-300">{kycMsg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
