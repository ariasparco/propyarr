'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';

type RuleItem = {
  key: string;
  severity: 'HARD' | 'SOFT' | 'TARGET';
  state: 'OK' | 'WARN' | 'BREACH' | 'MET' | 'OFF';
  used: number;
  limit: number;
  usedPct: number;
  unit: 'usd' | 'percent' | 'days' | 'count';
  detail?: string;
};

type Report = {
  equity: number;
  balance: number;
  profit: number;
  profitPct: number;
  status: string;
  rules: RuleItem[];
  breaches: string[];
  warnings: string[];
  voidedProfit: number;
  checkedAt: string;
  source: string;
};

export type MonitorT = {
  check: string;
  recheck: string;
  checking: string;
  liveSync?: string;
  syncing?: string;
  syncSuccess?: string;
  syncFailed?: string;
  scanning: string[];
  lastChecked: string;
  allClear: string;
  warned: string;
  breached: string;
  liveData: string;
  storedData: string;
  failed: string;
  close: string;
  days: string;
  trades: string;
  voided: string;
  states: Record<string, string>;
  rules: Record<string, { name: string; desc: string }>;
};

// Each card is tinted by its own state, so the whole panel can be read at a
// glance: a wall of green means everything is comfortably inside the limits.
// The tints stay faint — the progress bar is what carries the detail.
const TONE: Record<
  RuleItem['state'],
  { bar: string; text: string; ring: string; card: string }
> = {
  OK: {
    bar: 'bg-emerald-400',
    text: 'text-emerald-300',
    ring: 'border-emerald-400/25',
    card: 'bg-emerald-500/[0.07]',
  },
  MET: {
    bar: 'bg-brand-400',
    text: 'text-brand-300',
    ring: 'border-brand-400/30',
    card: 'bg-brand-500/[0.09]',
  },
  WARN: {
    bar: 'bg-amber-400',
    text: 'text-amber-300',
    ring: 'border-amber-400/30',
    card: 'bg-amber-500/[0.09]',
  },
  BREACH: {
    bar: 'bg-red-500',
    text: 'text-red-300',
    ring: 'border-red-500/35',
    card: 'bg-red-500/[0.1]',
  },
  // Rule switched off for this account — shown greyed rather than hidden, so
  // the trader can see it is simply not enforced.
  OFF: {
    bar: 'bg-white/20',
    text: 'text-white/35',
    ring: 'border-white/10',
    card: 'bg-ink-850/50',
  },
};

// The scan is a real network round-trip, but a short floor keeps the progress
// steps readable instead of flashing past.
const MIN_SCAN_MS = 1600;

export function AccountMonitor({
  accountId,
  locale,
  t,
  variant = 'inline',
}: {
  accountId: string;
  locale: Locale;
  t: MonitorT;
  variant?: 'inline' | 'modal';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function check(withSync = false) {
    setBusy(true);
    setIsSyncing(withSync);
    setError(false);
    setStep(0);
    timer.current = setInterval(
      () => setStep((s) => Math.min(s + 1, t.scanning.length - 1)),
      MIN_SCAN_MS / t.scanning.length,
    );
    const startedAt = Date.now();
    try {
      const endpoint = withSync ? '/api/accounts/sync' : '/api/accounts/check';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, sync: withSync }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('failed');
      await new Promise((r) =>
        setTimeout(r, Math.max(0, MIN_SCAN_MS - (Date.now() - startedAt))),
      );
      setReport(data.report as Report);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
      setIsSyncing(false);
    }
  }

  const trigger = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => check(false)}
        disabled={busy}
        className={
          variant === 'modal'
            ? 'rounded-lg border border-sky-500/35 px-2.5 py-1 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/10 disabled:opacity-50'
            : 'btn-primary px-5 py-2 text-sm disabled:opacity-70'
        }
      >
        {busy && !isSyncing ? t.checking : report ? t.recheck : t.check}
      </button>
      <button
        type="button"
        onClick={() => check(true)}
        disabled={busy}
        title={t.liveSync ?? 'همگام‌سازی زنده متاتریدر ۵'}
        className={
          variant === 'modal'
            ? 'rounded-lg border border-emerald-500/35 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50'
            : 'inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50'
        }
      >
        <svg
          aria-hidden
          className={`h-3.5 w-3.5 ${busy && isSyncing ? 'animate-spin' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        <span>
          {busy && isSyncing ? (t.syncing ?? 'همگام‌سازی…') : (t.liveSync ?? 'همگام‌سازی زنده')}
        </span>
      </button>
    </div>
  );

  const scan = (
    <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4">
      {t.scanning.map((line, i) => (
        <div key={line} className="flex items-center gap-2.5 text-xs">
          <span
            className={
              'h-1.5 w-1.5 shrink-0 rounded-full ' +
              (i < step
                ? 'bg-emerald-400'
                : i === step
                  ? 'animate-pulse bg-brand-400'
                  : 'bg-white/20')
            }
          />
          <span
            className={
              'transition-colors ' + (i <= step ? 'text-white/70' : 'text-white/30')
            }
          >
            {line}
          </span>
        </div>
      ))}
    </div>
  );

  const body = report ? (
    <ReportView report={report} locale={locale} t={t} />
  ) : null;

  if (variant === 'modal') {
    return (
      <>
        {trigger}
        {(busy || report || error) && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => {
              if (!busy) {
                setReport(null);
                setError(false);
              }
            }}
          >
            <div
              className="card w-full max-w-3xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {busy && scan}
              {error && !busy && (
                <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {t.failed}
                </p>
              )}
              {body}
              {!busy && (
                <button
                  type="button"
                  onClick={() => {
                    setReport(null);
                    setError(false);
                  }}
                  className="btn-ghost mt-5 w-full py-2 text-sm"
                >
                  {t.close}
                </button>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mt-5 border-t border-white/[0.06] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {trigger}
        {report && !busy && (
          <span className="text-xs text-white/40">
            {t.lastChecked}:{' '}
            {new Date(report.checkedAt).toLocaleString(
              locale === 'fa' ? 'fa-IR' : 'en-US',
            )}{' '}
            ·{' '}
            {report.source === 'stored' ? (
              t.storedData
            ) : (
              <span className="text-emerald-300/80">{t.liveData}</span>
            )}
          </span>
        )}
      </div>
      {busy && <div className="mt-4">{scan}</div>}
      {error && !busy && (
        <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {t.failed}
        </p>
      )}
      {!busy && body}
    </div>
  );
}

function ReportView({
  report,
  locale,
  t,
}: {
  report: Report;
  locale: Locale;
  t: MonitorT;
}) {
  const verdict = report.breaches.length
    ? { text: t.breached, cls: 'border-red-500/30 bg-red-500/10 text-red-200' }
    : report.warnings.length
      ? {
          text: t.warned,
          cls: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
        }
      : {
          text: t.allClear,
          cls: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
        };

  function value(r: RuleItem, n: number): string {
    if (r.unit === 'usd') return formatCurrency(n, locale);
    if (r.unit === 'percent') return `${n.toFixed(1)}%`;
    if (r.unit === 'days') return `${n} ${t.days}`;
    return `${n} ${t.trades}`;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className={`rounded-xl border px-4 py-2.5 text-sm ${verdict.cls}`}>
        {verdict.text}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {report.rules.map((r) => {
          const meta = t.rules[r.key];
          const tone = TONE[r.state];
          return (
            <div
              key={r.key}
              className={`rounded-2xl border p-4 transition-colors ${tone.ring} ${tone.card}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white/90">
                    {meta?.name ?? r.key}
                  </p>
                  <p className="mt-0.5 text-[0.7rem] leading-relaxed text-white/40">
                    {meta?.desc}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${tone.ring} ${tone.text}`}
                >
                  {t.states[r.state] ?? r.state}
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone.bar}`}
                  style={{ width: `${Math.min(100, r.usedPct)}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[0.7rem]">
                <span className="font-mono text-white/60">
                  {value(r, r.used)}
                  {r.limit > 0 && (
                    <span className="text-white/30">
                      {' / '}
                      {value(r, r.limit)}
                    </span>
                  )}
                </span>
                <span className={`font-mono ${tone.text}`}>
                  {r.usedPct.toFixed(0)}%
                </span>
              </div>

              {r.detail && (
                <p className="mt-2 font-mono text-[0.68rem] text-red-300">
                  {r.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {report.voidedProfit > 0 && (
        <p className="text-xs text-white/45">
          {t.voided}: {formatCurrency(report.voidedProfit, locale)}
        </p>
      )}
    </div>
  );
}
