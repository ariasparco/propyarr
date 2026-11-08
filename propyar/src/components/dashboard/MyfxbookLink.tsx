'use client';

import { useState } from 'react';

type T = {
  myfxbook: string;
  myfxbookHint: string;
  myfxbookSave: string;
  myfxbookSaved: string;
  myfxbookOpen: string;
  myfxbookInvalid: string;
};

/** Lets the owner attach the account's public Myfxbook page. */
export function MyfxbookLink({ accountId, initial, t }: { accountId: string; initial: string | null; t: T }) {
  const [url, setUrl] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad'>('idle');

  async function save() {
    const value = url.trim();
    if (value && !/^https:\/\/(www\.)?myfxbook\.com\//i.test(value)) return setState('bad');
    setState('busy');
    const res = await fetch('/api/accounts/myfxbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, url: value }),
    }).catch(() => null);
    if (res?.ok) {
      setSaved(value);
      setState('ok');
    } else setState('bad');
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
      <h3 className="text-lg font-black text-white">{t.myfxbook}</h3>
      <p className="mt-1 text-sm text-white/55">{t.myfxbookHint}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setState('idle');
          }}
          dir="ltr"
          placeholder="https://www.myfxbook.com/members/..."
          className="field-input min-w-[16rem] flex-1"
        />
        <button type="button" onClick={save} disabled={state === 'busy'} className="btn-primary">
          {state === 'ok' ? t.myfxbookSaved : t.myfxbookSave}
        </button>
        {saved && (
          <a href={saved} target="_blank" rel="noopener noreferrer" className="btn-ghost">
            {t.myfxbookOpen}
          </a>
        )}
      </div>
      {state === 'bad' && <p className="mt-2 text-sm text-red-600">{t.myfxbookInvalid}</p>}
    </div>
  );
}
