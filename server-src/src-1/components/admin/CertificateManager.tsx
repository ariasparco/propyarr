'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type ExistingCertificate = {
  id: string;
  stage: string;
};

export type CertificateT = {
  issue: string;
  title: string;
  stage: string;
  choose: string;
  note: string;
  notePlaceholder: string;
  submit: string;
  uploading: string;
  generate: string;
  generating: string;
  generateHint: string;
  orUpload: string;
  replace: string;
  remove: string;
  view: string;
  tooBig: string;
  failed: string;
  cancel: string;
  issued: string;
  stages: Record<string, string>;
};

const MAX_BYTES = 4 * 1024 * 1024;

export function CertificateManager({
  accountId,
  phase,
  certificates,
  t,
}: {
  accountId: string;
  phase: string;
  certificates: ExistingCertificate[];
  t: CertificateT;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(phase === 'FUNDED' ? 'FUNDED' : phase);
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyIssued = certificates.find((c) => c.stage === stage);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t.tooBig);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, stage, image, note }),
      });
      if (!res.ok) throw new Error('failed');
      setImage(null);
      setNote('');
      setOpen(false);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, stage }),
      });
      if (!res.ok) throw new Error('failed');
      setOpen(false);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(certificateId: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId }),
      });
      if (!res.ok) throw new Error('failed');
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const pill =
    'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${pill} border-sky-500/40 text-sky-200 hover:bg-sky-500/10`}
        >
          {t.issue}
        </button>
        {certificates.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[0.7rem] text-emerald-300"
          >
            {t.stages[c.stage] ?? c.stage}
            <a
              href={`/api/certificates/${c.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted hover:text-emerald-200"
            >
              {t.view}
            </a>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={busy}
              className="text-red-300 hover:text-red-200"
              aria-label={t.remove}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="space-y-2 rounded-lg border border-line bg-ink-900/60 p-3"
        >
          <p className="text-xs font-semibold text-white">{t.title}</p>

          <label className="field-label">{t.stage}</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="field-input py-2 text-sm"
          >
            {Object.entries(t.stages).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {alreadyIssued && (
            <p className="text-[0.7rem] text-amber-300">{t.replace}</p>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="btn-ghost w-full border border-brand-500/40 py-2 text-xs text-brand-200 disabled:opacity-50"
          >
            {busy ? t.generating : t.generate}
          </button>
          <p className="text-[0.65rem] leading-relaxed text-white/35">
            {t.generateHint}
          </p>

          <div className="flex items-center gap-2 py-1">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[0.65rem] text-white/30">{t.orUpload}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={pick}
            className="field-input py-2 text-xs file:me-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-white"
          />
          {image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt="certificate preview"
              className="max-h-32 w-full rounded-md bg-black/40 object-contain"
            />
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
            className="field-input py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !image}
              className="btn-primary flex-1 py-2 text-xs disabled:opacity-50"
            >
              {busy ? t.uploading : t.submit}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-ghost py-2 text-xs"
            >
              {t.cancel}
            </button>
          </div>
          {error && <p className="text-center text-xs text-red-300">{error}</p>}
        </form>
      )}
    </div>
  );
}
