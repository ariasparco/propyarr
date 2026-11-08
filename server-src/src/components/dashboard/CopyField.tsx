'use client';

import { useState } from 'react';

/** Read-only value with a copy button — used for referral codes and links. */
export function CopyField({
  label,
  value,
  copy,
  big = false,
}: {
  label: string;
  value: string;
  copy: string;
  big?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the value is selectable anyway */
    }
  }

  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="mt-1 flex items-stretch gap-2">
        <p
          dir="ltr"
          className={
            'min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 font-mono text-white/90 ' +
            (big ? 'text-lg font-bold tracking-[0.2em]' : 'text-xs')
          }
        >
          {value}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className={
            'shrink-0 rounded-xl border px-4 text-xs font-medium transition-colors ' +
            (copied
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-white/15 text-white/70 hover:bg-white/5')
          }
        >
          {copied ? '✓' : copy}
        </button>
      </div>
    </div>
  );
}
