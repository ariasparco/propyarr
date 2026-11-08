'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

type AuthDict = Dictionary['auth'];

/**
 * Password recovery in one place: ask for the address, then take the emailed
 * code and the new password together. The code is only spent when the password
 * is actually set, so a half-finished attempt never burns it.
 */
export function ForgotForm({
  locale,
  dict,
}: {
  locale: Locale;
  dict: AuthDict;
}) {
  const router = useRouter();
  const t = dict.verify;
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function mapError(name?: string): string {
    switch (name) {
      case 'invalid':
      case 'bad_code':
        return t.wrongCode;
      case 'expired':
      case 'no_code':
        return t.expired;
      case 'too_many_attempts':
      case 'too_many_requests':
        return t.tooManyAttempts;
      case 'weak':
        return dict.errors.weak;
      default:
        return dict.errors.generic;
    }
  }

  async function requestCode(target: string) {
    const res = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target, locale }),
    });
    if (!res.ok) throw new Error('failed');
  }

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestCode(email);
      setStep('code');
    } catch {
      setError(dict.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  async function onResetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    if (password.length < 8) return setError(dict.errors.weak);
    if (password !== String(fd.get('confirmPassword') ?? ''))
      return setError(dict.errors.mismatch);

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(mapError(data.error));
        return;
      }
      setDone(true);
      setTimeout(() => router.push(path(locale, '/login')), 2000);
    } catch {
      setError(dict.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    setResent(false);
    try {
      await requestCode(email);
      setResent(true);
      setCode('');
    } catch {
      setError(t.tooManyAttempts);
    }
  }

  if (done) {
    return (
      <div className="card p-7 sm:p-8">
        <h1 className="text-2xl font-bold text-white">{dict.resetTitle}</h1>
        <p className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {dict.resetDone}
        </p>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div className="card p-7 sm:p-8">
        <h1 className="text-2xl font-bold text-white">{dict.resetTitle}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-white/50">
          {t.subtitle}{' '}
          <span dir="ltr" className="font-mono text-white/80">
            {email}
          </span>
        </p>

        <form onSubmit={onResetSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="code" className="field-label">
              {t.codeLabel}
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="field-input text-center font-mono text-2xl tracking-[0.6em]"
              placeholder="------"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              {dict.newPassword}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="field-label">
              {dict.confirmPassword}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className="field-input"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
          {resent && (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
              {t.resent}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? '…' : dict.savePassword}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={resend}
            className="font-medium text-brand-300 transition-colors hover:text-brand-200"
          >
            {t.resend}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
            className="text-white/40 transition-colors hover:text-white/70"
          >
            {t.back}
          </button>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-white/35">
          {t.spamHint}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-7 sm:p-8">
      <h1 className="text-2xl font-bold text-white">{dict.forgotTitle}</h1>
      <p className="mt-1.5 text-sm text-white/50">{dict.forgotSubtitle}</p>

      <form onSubmit={onEmailSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            {dict.email}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
          />
        </div>
        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? '…' : dict.sendLink}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        <Link
          href={path(locale, '/login')}
          className="font-medium text-brand-300 hover:text-brand-200"
        >
          {dict.backToLogin}
        </Link>
      </p>
    </div>
  );
}
