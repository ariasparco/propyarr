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
  gateButton: string;
};

export function ProfileEditor({
  initialPhone,
  kycStatus,
  kycHref,
  t,
  labels,
}: {
  initialPhone: string;
  kycStatus: string;
  kycHref?: string;
  t: KycT;
  labels: { phone: string; save: string; saved: string };
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);


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

  const statusMap: Record<string, { label: string; cls: string }> = {
    PENDING: { label: t.statusPending, cls: 'bg-amber-500/15 text-amber-300' },
    APPROVED: { label: t.statusApproved, cls: 'bg-brand-500/15 text-brand-300' },
    REJECTED: { label: t.statusRejected, cls: 'bg-red-500/15 text-red-300' },
    NONE: { label: t.statusNone, cls: 'bg-white/10 text-white/60' },
  };
  const s = statusMap[kycStatus] ?? statusMap.NONE;

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

      {/* KYC lives on its own page now; this card points there. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h3 className="text-base font-semibold text-white">{t.title}</h3>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}
          >
            {s.label}
          </span>
        </div>
        {kycHref && (
          <a href={kycHref} className="btn-ghost">
            {t.gateButton}
          </a>
        )}
      </div>
    </div>
  );
}
