'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

type Props = {
  mode: 'login' | 'register';
  locale: Locale;
  dict: Dictionary['auth'];
  admin?: boolean;
};

export function AuthForm({ mode, locale, dict, admin = false }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const isRegister = mode === 'register';

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set once a signup needs its emailed code confirmed.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  function mapError(code?: string): string {
    switch (code) {
      case 'exists':
        return dict.errors.exists;
      case 'invalid':
        return dict.errors.invalid;
      case 'weak':
        return dict.errors.weak;
      case 'too_many_requests':
        return dict.errors.tooMany;
      case 'not_verified':
        return dict.verify.mustVerify;
      default:
        return dict.errors.generic;
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '');
    const password = String(fd.get('password') ?? '');

    if (isRegister) {
      if (password.length < 8) return setError(dict.errors.weak);
      if (password !== String(fd.get('confirmPassword') ?? ''))
        return setError(dict.errors.mismatch);
    }

    setLoading(true);
    try {
      const payload = isRegister
        ? {
            name: String(fd.get('name') ?? ''),
            email,
            phone: String(fd.get('phone') ?? ''),
            password,
            referralCode: String(fd.get('referralCode') ?? '') || undefined,
          }
        : { email, password };
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Registration now ends with a code, not a session.
        if (data?.status === 'VERIFY_REQUIRED') {
          setPendingEmail(data.email ?? email);
          setLoading(false);
          return;
        }
        if (admin && data?.user?.role !== 'ADMIN') {
          setError(dict.errors.notAdmin);
          setLoading(false);
          return;
        }
        router.push(next || path(locale, admin ? '/admin' : '/dashboard'));
        router.refresh();
        return;
      }
      // Signing in with an account that never confirmed its code drops
      // straight into the code step rather than a dead end.
      if (data.error === 'not_verified') {
        setPendingEmail(email);
        setLoading(false);
        return;
      }
      setError(mapError(data.error));
    } catch {
      setError(dict.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  const title = isRegister
    ? dict.registerTitle
    : admin
      ? dict.adminTitle
      : dict.loginTitle;
  const subtitle = isRegister
    ? dict.registerSubtitle
    : admin
      ? dict.adminSubtitle
      : dict.loginSubtitle;

  if (pendingEmail) {
    return (
      <VerifyStep
        email={pendingEmail}
        locale={locale}
        dict={dict}
        next={next}
        onBack={() => setPendingEmail(null)}
      />
    );
  }

  return (
    <div className="card p-7 sm:p-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-1.5 text-sm text-white/50">{subtitle}</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {isRegister && (
          <div>
            <label htmlFor="name" className="field-label">
              {dict.name}
            </label>
            <input id="name" name="name" required className="field-input" />
          </div>
        )}
        <div>
          <label htmlFor="email" className="field-label">
            {dict.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field-input"
          />
        </div>
        {isRegister && (
          <div>
            <label htmlFor="phone" className="field-label">
              {dict.phone}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              dir="ltr"
              className="field-input"
            />
          </div>
        )}
        <div>
          <label htmlFor="password" className="field-label">
            {dict.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            className="field-input"
          />
        </div>
        {isRegister && (
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
        )}
        {/* A friend's code. Only accepted here — it cannot be added later. */}
        {isRegister && (
          <div>
            <label htmlFor="referralCode" className="field-label">
              {dict.referralCode}
            </label>
            <input
              id="referralCode"
              name="referralCode"
              dir="ltr"
              defaultValue={params.get('ref') ?? ''}
              placeholder={dict.referralPlaceholder}
              className="field-input font-mono uppercase"
            />
            <p className="mt-1.5 text-xs text-white/35">{dict.referralHint}</p>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? '…' : isRegister ? dict.signUp : dict.signIn}
        </button>
      </form>

      {!isRegister && (
        <p className="mt-4 text-center text-sm">
          <Link
            href={path(locale, '/forgot-password')}
            className="text-white/50 transition-colors hover:text-white/80"
          >
            {dict.forgotLink}
          </Link>
        </p>
      )}

      {!admin && (
        <p className="mt-6 text-center text-sm text-white/50">
          {isRegister ? dict.hasAccount : dict.noAccount}{' '}
          <Link
            href={path(locale, isRegister ? '/login' : '/register')}
            className="font-medium text-brand-300 hover:text-brand-200"
          >
            {isRegister ? dict.signInLink : dict.createOne}
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * Signup code step. Shown right after registering, and also when someone tries
 * to sign in with an account that never confirmed its code.
 */
function VerifyStep({
  email,
  locale,
  dict,
  next,
  onBack,
}: {
  email: string;
  locale: Locale;
  dict: Dictionary['auth'];
  next: string | null;
  onBack: () => void;
}) {
  const router = useRouter();
  const t = dict.verify;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function mapError(codeName?: string): string {
    switch (codeName) {
      case 'invalid':
      case 'bad_code':
        return t.wrongCode;
      case 'expired':
      case 'no_code':
        return t.expired;
      case 'too_many_attempts':
      case 'too_many_requests':
        return t.tooManyAttempts;
      case 'already_verified':
        return t.alreadyVerified;
      default:
        return dict.errors.generic;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(mapError(data.error));
        return;
      }
      router.push(next || path(locale, '/dashboard'));
      router.refresh();
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
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      });
      if (!res.ok) throw new Error('failed');
      setResent(true);
      setCode('');
    } catch {
      setError(t.tooManyAttempts);
    }
  }

  return (
    <div className="card p-7 sm:p-8">
      <h1 className="text-2xl font-bold text-white">{t.title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-white/50">
        {t.subtitle}{' '}
        <span dir="ltr" className="font-mono text-white/80">
          {email}
        </span>
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="code" className="field-label">
            {t.codeLabel}
          </label>
          <input
            id="code"
            name="code"
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
          {loading ? '…' : t.confirm}
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
          onClick={onBack}
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
