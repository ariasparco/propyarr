'use client';

import { useState } from 'react';
import type { Dictionary } from '@/i18n';
import { Avatar } from './Avatar';
import { PenIcon, StarIcon } from '@/components/site/Icons';

/**
 * A small "leave a review" link that opens a form. Submissions wait for staff
 * approval before they appear in the reviews carousel.
 */
export function ReviewForm({ t, className = '' }: { t: Dictionary['reviews']; className?: string }) {
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [rating, setRating] = useState(5);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState('sending');
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(fd.get('name') ?? ''),
          text: String(fd.get('text') ?? ''),
          gender,
          rating,
        }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState('idle');
        }}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 underline-offset-4 transition-colors hover:text-brand-300 hover:underline ${className}`}
      >
        <PenIcon size={13} />
        {t.leave}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#03261B]/50 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-card-hover">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{t.formTitle}</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-white/50 hover:text-white">
                {t.close}
              </button>
            </div>

            {state === 'done' ? (
              <p className="mt-6 rounded-xl bg-brand-500/10 p-4 text-sm leading-relaxed text-brand-300">{t.thanks}</p>
            ) : (
              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="rv-name" className="field-label">{t.name}</label>
                  <input id="rv-name" name="name" required minLength={2} maxLength={40} className="field-input" />
                </div>

                <div>
                  <span className="field-label">{t.gender}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['male', 'female'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        className={
                          'flex items-center gap-2 rounded-xl border p-2 text-sm font-semibold transition-colors ' +
                          (gender === g ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/15 text-white/70')
                        }
                      >
                        <Avatar gender={g} size={34} />
                        {g === 'male' ? t.male : t.female}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="field-label">{t.rating}</span>
                  <div className="flex gap-1" dir="ltr">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" aria-label={`${n}`} onClick={() => setRating(n)} className="text-gold-400">
                        <StarIcon size={26} className={n <= rating ? '' : 'opacity-25'} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="rv-text" className="field-label">{t.text}</label>
                  <textarea id="rv-text" name="text" required minLength={10} maxLength={400} rows={4} className="field-input resize-none" />
                </div>

                {state === 'error' && <p className="text-sm text-red-500">{t.failed}</p>}
                <button type="submit" disabled={state === 'sending'} className="btn-primary w-full">
                  {state === 'sending' ? t.sending : t.submit}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
