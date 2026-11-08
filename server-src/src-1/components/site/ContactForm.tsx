'use client';

import { useState } from 'react';
import type { Dictionary } from '@/i18n';

export function ContactForm({ dict }: { dict: Dictionary['contactPage']['form'] }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>(
    'idle',
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('failed');
      setStatus('ok');
      form.reset();
    } catch {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="field-label">
            {dict.name}
          </label>
          <input id="name" name="name" required className="field-input" />
        </div>
        <div>
          <label htmlFor="email" className="field-label">
            {dict.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="field-input"
          />
        </div>
      </div>
      <div>
        <label htmlFor="subject" className="field-label">
          {dict.subject}
        </label>
        <input id="subject" name="subject" required className="field-input" />
      </div>
      <div>
        <label htmlFor="message" className="field-label">
          {dict.message}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          className="field-input resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="btn-primary w-full"
      >
        {status === 'sending' ? dict.sending : dict.send}
      </button>

      {status === 'ok' && (
        <p className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-200">
          {dict.success}
        </p>
      )}
      {status === 'error' && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {dict.error}
        </p>
      )}
    </form>
  );
}
