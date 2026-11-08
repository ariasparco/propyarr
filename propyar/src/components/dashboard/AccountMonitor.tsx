'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';

type RuleItem = {
  key: string;
  severity: 'HARD' | 'SOFT' | 'TARGET' | 'INFO';
  state: 'OK' | 'WARN' | 'BREACH' | 'MET' | 'OFF';
  used: number;
  limit: number;
  usedPct: number;
  unit: 'usd' | 'percent' | 'days' | 'count';
  detail?: string;
  remaining?: number;
};

type Report = {
  equity: number;
  balance: number;
  profit: number;
  profitPct: number;
  targetBalance: number;
  targetRemaining: number;
  targetPct: number;
  status: string;
  rules: RuleItem[];
  breaches: string[];
  warnings: string[];
  voidedProfit: number;
  floatingPnl: number;
  openPositions: number;
  closedTrades: number;
  checkedAt: string;
  source: string;
  dataAgeMs?: number | null;
  stale?: boolean;
};

export type MonitorT = {
  check: string;
  recheck: string;
  checking: string;
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
  targetBalance: string;
  targetRemaining: string;
  maintenance: string;
  maintenanceBody: string;
  maintenanceMyfxbook: string;
  // Added with the single-button panel; optional so an out-of-date dictionary
  // renders in English rather than crashing the page.
  stale?: string;
  staleHint?: string;
  dataAge?: string;
  reason?: string;
  openNow?: string;
  peakRisk?: string;
  waited?: string;
  minutes?: string;
  noBar?: string;
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
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // One action, not two.
  //
  // The panel used to offer "check" and "live sync" side by side, and a third
  // sync button sat next to them in the admin table. Checking without syncing
  // reports rules against whatever was last stored, which is the one thing
  // nobody wants: a verdict on stale figures. So the button always does both —
  // pull the terminal, then run every rule against what came back.
  async function check() {
    setBusy(true);
    setError(false);
    setStep(0);
    timer.current = setInterval(
      () => setStep((s) => Math.min(s + 1, t.scanning.length - 1)),
      MIN_SCAN_MS / t.scanning.length,
    );
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.report) throw new Error('failed');
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
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={check}
      disabled={busy}
      className={
        variant === 'modal'
          ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50'
          : 'btn-primary inline-flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-70'
      }
    >
      <svg
        aria-hidden
        className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
      </svg>
      <span>{busy ? t.checking : report ? t.recheck : t.check}</span>
    </button>
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

  /**
   * Standing notice above the analysis panel.
   *
   * The figures below it are informational while the engine is being reworked:
   * what actually decides a stage is the manual review that happens when the
   * trader requests the next one, against the published rules and the account's
   * own myfxbook record. Saying so here is the difference between a trader who
   * reads the rules and one who assumes a green panel means they have passed.
   */
  const notice = (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
      <p className="text-sm font-semibold text-amber-200">{t.maintenance}</p>
      <p className="mt-1.5 text-[0.78rem] leading-relaxed text-amber-100/70">
        {t.maintenanceBody}
      </p>
      <p className="mt-1.5 text-[0.78rem] leading-relaxed text-amber-100/70">
        {t.maintenanceMyfxbook}
      </p>
    </div>
  );

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
              {notice}
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
            {report.stale || report.source === 'stored' ? (
              t.storedData
            ) : (
              <span className="text-emerald-300/80">{t.liveData}</span>
            )}
          </span>
        )}
      </div>
      <div className="mt-4">{notice}</div>
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

/** "3 hours" / "12 minutes", for the staleness notice. */
function humanAge(ms: number, locale: Locale, t: MonitorT): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60)
    return `${minutes.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')} ${t.minutes ?? 'min'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48)
    return `${hours.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')} ${locale === 'fa' ? 'ساعت' : 'h'}`;
  const days = Math.round(hours / 24);
  return `${days.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')} ${t.days}`;
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
  const fa = locale === 'fa';
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

  /**
   * Turns a rule's machine-readable `detail` into a sentence.
   *
   * These used to be printed raw and always in red, which is why an account
   * with nothing open showed a lone red "0" under its floating-risk card.
   */
  function explain(r: RuleItem): { text: string; danger: boolean } | null {
    const d = r.detail;
    if (!d) return null;

    if (d.startsWith('open:') || d.startsWith('peak:')) {
      const count = Number(d.slice(5)) || 0;
      const open = `${count.toLocaleString(fa ? 'fa-IR' : 'en-US')} ${
        t.openNow ?? (fa ? 'پوزیشن باز' : 'open')
      }`;
      return d.startsWith('peak:')
        ? {
            text: `${t.peakRisk ?? (fa ? 'بیشترین ریسک ثبت‌شده' : 'highest recorded')} · ${open}`,
            danger: false,
          }
        : { text: open, danger: false };
    }

    if (d.startsWith('waited:')) {
      const [mins, iso] = d.slice(7).split('|');
      const when = iso
        ? new Date(iso).toLocaleString(fa ? 'fa-IR' : 'en-US')
        : '';
      const waited = `${t.waited ?? (fa ? 'فاصله تا معامله بعدی' : 'waited')}: ${Number(
        mins,
      ).toLocaleString(fa ? 'fa-IR' : 'en-US')} ${t.minutes ?? 'min'}`;
      return { text: when ? `${waited} · ${when}` : waited, danger: true };
    }

    if (d === 'open')
      return {
        text: fa ? 'پوزیشن باز دارید' : 'positions still open',
        danger: false,
      };

    // Anything else is a symbol list from the instrument rule.
    return { text: d, danger: true };
  }

  const failed = report.rules.filter(
    (r) => r.severity === 'HARD' && r.state === 'BREACH',
  );

  return (
    <div className="mt-4 space-y-4">
      <div className={`rounded-xl border px-4 py-2.5 text-sm ${verdict.cls}`}>
        {verdict.text}
      </div>

      {/* Why the account failed, with the actual numbers. A rule name on its own
          cannot answer a trader asking what happened. */}
      {failed.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
          <p className="text-xs font-medium text-red-200">
            {t.reason ?? (fa ? 'دلیل رد شدن حساب' : 'Reason')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {failed.map((r) => {
              const note = explain(r);
              return (
                <li key={r.key} className="text-[0.72rem] text-red-200/80">
                  <span className="font-medium text-red-200">
                    {t.rules[r.key]?.name ?? r.key}
                  </span>
                  {' — '}
                  <span className="font-mono">
                    {value(r, r.used)}
                    {r.limit > 0 && ` / ${value(r, r.limit)}`}
                  </span>
                  {note && <span className="text-red-200/60"> · {note.text}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* A green report over dead data is a statement about the past. Say so. */}
      {report.stale && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-xs text-amber-200/90">
          {t.stale ?? 'Terminal data is out of date.'}
          {typeof report.dataAgeMs === 'number' && (
            <span className="font-mono">
              {' '}
              ({humanAge(report.dataAgeMs, locale, t)})
            </span>
          )}
          <span className="block text-amber-200/60">
            {t.staleHint ??
              'The rules below were run against the last figures received.'}
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {report.rules.map((r) => {
          const meta = t.rules[r.key];
          const tone = TONE[r.state];
          const note = explain(r);
          // Counting rules have no allowance to fill. Drawing a full bar for
          // "14 short trades" read as "100% breached" when it is only a count.
          const hasGauge = r.limit > 0;
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

              {hasGauge && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone.bar}`}
                    style={{ width: `${Math.min(100, r.usedPct)}%` }}
                  />
                </div>
              )}

              <div
                className={`flex items-center justify-between text-[0.7rem] ${
                  hasGauge ? 'mt-2' : 'mt-3'
                }`}
              >
                <span className="font-mono text-white/60">
                  {value(r, r.used)}
                  {hasGauge && (
                    <span className="text-white/30">
                      {' / '}
                      {value(r, r.limit)}
                    </span>
                  )}
                </span>
                {hasGauge && (
                  <span className={`font-mono ${tone.text}`}>
                    {r.usedPct.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* The objective in the terms the rules are written in: a balance
                  to reach, and what is left to reach it. "$0 of $100" on an
                  account sitting at $990 was the headline target minus a
                  profit figure floored at zero — it told a trader who had lost
                  ground that they still needed exactly what they needed on day
                  one. */}
              {r.key === 'PROFIT_TARGET' && r.limit > 0 && (
                <p className="mt-2 text-[0.68rem] text-white/45">
                  {t.targetBalance}:{' '}
                  <span className="font-mono text-white/70">
                    {formatCurrency(report.targetBalance, locale)}
                  </span>
                  {(r.remaining ?? 0) > 0 && (
                    <>
                      {' · '}
                      {t.targetRemaining}:{' '}
                      <span className="font-mono text-brand-300">
                        {formatCurrency(r.remaining ?? 0, locale)}
                      </span>
                    </>
                  )}
                </p>
              )}

              {note && (
                <p
                  className={`mt-2 font-mono text-[0.68rem] ${
                    note.danger ? 'text-red-300' : 'text-white/45'
                  }`}
                >
                  {note.text}
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
