import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { AccountView, PlanView } from '@/lib/types';
import type { DashAlert, PnlPoint } from '@/lib/dashboard';
import { path } from '@/lib/routes';
import {
  BarsIcon,
  BoltIcon,
  CardIcon,
  ChevronIcon,
  CopyIcon,
  HeadsetIcon,
  LayersIcon,
  PercentIcon,
  ShieldIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
} from '@/components/site/Icons';

const usd = (n: number, digits = 0) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

// ── Stat card ───────────────────────────────────────────────
export function DashStat({
  label,
  value,
  icon,
  delta,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  delta?: { text: string; good: boolean } | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white/60">{label}</p>
        <div className="mt-2 flex items-center gap-2">
          <p dir="ltr" className="font-sans text-2xl font-black text-white sm:text-[1.75rem]">
            {value}
          </p>
          {delta && (
            <span
              dir="ltr"
              className={
                'rounded-md px-1.5 py-0.5 text-xs font-bold ' +
                (delta.good ? 'bg-brand-500/10 text-brand-400' : 'bg-red-500/10 text-red-600')
              }
            >
              {delta.text}
            </span>
          )}
        </div>
      </div>
      <span className="text-brand-400">{icon}</span>
    </div>
  );
}

// ── Progress donut ──────────────────────────────────────────
function Donut({ pct, label }: { pct: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgb(var(--brand-800))" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="rgb(var(--brand-500))"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span dir="ltr" className="font-sans text-3xl font-black text-white">
          {Math.round(p)}%
        </span>
        <span className="mt-0.5 max-w-[6.5rem] text-xs font-semibold leading-tight text-white/60">{label}</span>
      </div>
    </div>
  );
}

// ── Main challenge account card ─────────────────────────────
export function ChallengeCard({
  account,
  locale,
  dict,
}: {
  account: AccountView;
  locale: Locale;
  dict: Dictionary;
}) {
  const c = dict.dash2.card;
  const phase = dict.dash2.phase[account.phase as keyof typeof dict.dash2.phase] ?? account.phase;
  const funded = account.phase === 'FUNDED';
  const S = account.startingBalance;
  const targetPct = account.profitTarget;
  const targetUsd = (S * targetPct) / 100;
  const profit = account.metrics.profit;
  const profitPct = account.metrics.profitPct;
  const progress = targetUsd > 0 ? (Math.max(0, profit) / targetUsd) * 100 : 0;
  const typeLabel =
    dict.plansPage.typeLabels[account.accountType as keyof typeof dict.plansPage.typeLabels] ?? account.accountType;

  const rows: Array<{ icon: ReactNode; label: string; value: string; tone?: string }> = [
    { icon: <CardIcon size={16} />, label: c.current, value: usd(account.balance, 0) },
    { icon: <LayersIcon size={16} />, label: c.initial, value: usd(S) },
    {
      icon: <TargetIcon size={16} />,
      label: `${funded ? c.payoutTarget : c.target}${funded ? '' : ` (${phase})`}`,
      value: targetPct > 0 ? `${targetPct}%  |  ${usd(targetUsd)}` : '—',
    },
    {
      icon: <BarsIcon size={16} />,
      label: c.progress,
      value: `${profitPct.toFixed(1)}%  |  ${usd(profit)}`,
      tone: profit >= 0 ? 'text-brand-400' : 'text-red-600',
    },
    {
      icon: <ShieldIcon size={16} />,
      label: c.daily,
      value: account.dailyDrawdown > 0 ? `${account.dailyDrawdown}%  |  ${usd((S * account.dailyDrawdown) / 100)}` : c.off,
      tone: 'text-gold-500',
    },
    {
      icon: <ShieldIcon size={16} />,
      label: c.total,
      value: `${account.maxDrawdown}%  |  ${usd((S * account.maxDrawdown) / 100)}`,
      tone: 'text-red-600',
    },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-black text-white">{c.title}</h3>
          <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-bold text-paper">{typeLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span dir="ltr" className="font-mono font-bold text-white/70">#{account.accountNumber}</span>
          <span className="rounded-lg border border-white/10 px-2 py-0.5 text-xs font-bold text-white/70">{account.platform}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
        <Donut pct={progress} label={`${c.progressOf} ${phase}`} />
        <dl className="w-full flex-1 divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <dt className="flex items-center gap-2 text-white/65">
                <span className="text-brand-400">{r.icon}</span>
                {r.label}
              </dt>
              <dd dir="ltr" className={`font-sans font-extrabold ${r.tone ?? 'text-white'}`}>
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Link href={path(locale, '/dashboard/accounts')} className="mt-3 inline-flex text-sm font-bold text-brand-300 hover:underline">
        {c.details} ←
      </Link>
    </div>
  );
}

// ── P&L area chart ──────────────────────────────────────────
export function PnlChart({
  points,
  locale,
  t,
}: {
  points: PnlPoint[];
  locale: Locale;
  t: { title: string; range: string; empty: string };
}) {
  const W = 560;
  const H = 230;
  const pad = { l: 46, r: 14, t: 26, b: 30 };
  const values = points.map((p) => p.cumulative);
  const hasData = points.some((p) => p.pnl !== 0);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min || 1);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const ticks = [min, (min + max) / 2, max];
  const last = points[points.length - 1];
  const dayLabel = (d: string) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-white">{t.title}</h3>
        <span className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-white/60">{t.range}</span>
      </div>
      {!hasData ? (
        <p className="flex h-[230px] items-center justify-center text-sm text-white/45">{t.empty}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" style={{ direction: 'ltr' }}>
          <defs>
            <linearGradient id="pnl-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--fg) / 0.07)" />
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--fg) / 0.5)">
                {usd(v)}
              </text>
            </g>
          ))}
          <path d={area} fill="url(#pnl-fill)" />
          <path d={line} fill="none" stroke="rgb(var(--brand-500))" strokeWidth="3" strokeLinejoin="round" />
          {points.map((p, i) => (
            <g key={p.day}>
              <circle cx={x(i)} cy={y(p.cumulative)} r="4.5" fill="rgb(var(--brand-800))" stroke="rgb(var(--brand-500))" strokeWidth="2.5" />
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="rgb(var(--fg) / 0.55)">
                {dayLabel(p.day)}
              </text>
            </g>
          ))}
          {last && (
            <g>
              <rect x={x(points.length - 1) - 48} y={y(last.cumulative) - 30} width="54" height="20" rx="6" fill="rgb(var(--brand-500))" />
              <text x={x(points.length - 1) - 21} y={y(last.cumulative) - 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                {last.cumulative >= 0 ? '+' : ''}
                {usd(last.cumulative)}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

// ── Quick actions ───────────────────────────────────────────
const ACTION_HREF: Record<string, string> = {
  buy: '/dashboard/buy',
  payouts: '/dashboard/payouts',
  wallet: '/dashboard/wallet',
  referrals: '/dashboard/referrals',
  discounts: '/dashboard/discounts',
  support: '/dashboard/tickets',
};
const ACTION_ICON: Record<string, ReactNode> = {
  buy: <TrophyIcon size={28} />,
  payouts: <CardIcon size={28} />,
  wallet: <BoltIcon size={28} />,
  referrals: <UsersIcon size={28} />,
  discounts: <PercentIcon size={28} />,
  support: <HeadsetIcon size={28} />,
};

export function QuickActions({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {dict.dash2.actions.map((a, i) => (
        <Link
          key={a.key}
          href={path(locale, ACTION_HREF[a.key])}
          className={
            'flex flex-col items-center justify-center gap-1.5 rounded-2xl p-4 text-center transition-all hover:-translate-y-0.5 ' +
            (i === 0
              ? 'bg-gradient-to-l from-[#0B5A37] to-[#14945A] text-paper shadow-glow'
              : 'border border-white/[0.06] bg-paper text-white shadow-card hover:shadow-card-hover')
          }
        >
          <span className={i === 0 ? 'text-paper' : 'text-brand-400'}>{ACTION_ICON[a.key]}</span>
          <span className="text-sm font-extrabold">{a.title}</span>
          <span className={'text-xs ' + (i === 0 ? 'text-paper/80' : 'text-white/50')}>{a.sub}</span>
        </Link>
      ))}
    </div>
  );
}

// ── Notifications ───────────────────────────────────────────
export function AlertsList({ alerts, locale, dict }: { alerts: DashAlert[]; locale: Locale; dict: Dictionary }) {
  const t = dict.dash2.alerts;
  const fill = (s: string, vars: Record<string, string | number>) =>
    s.replace(/\{(\w+)\}/g, (_, k) => (k === 'amount' ? usd(Number(vars[k]), 0) : String(vars[k] ?? '')));
  const ago = (iso: string) => {
    const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
    const rtf = new Intl.RelativeTimeFormat(locale === 'fa' ? 'fa' : 'en', { numeric: 'auto' });
    if (mins < 60) return rtf.format(-mins, 'minute');
    if (mins < 1440) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  };
  return (
    <div id="alerts" className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
      <h3 className="text-lg font-black text-white">{dict.dash2.alertsTitle}</h3>
      {alerts.length === 0 ? (
        <p className="mt-4 text-sm text-white/50">{t.none}</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {alerts.map((a, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/85">{fill(t[a.kind], a.vars)}</p>
                <p className="mt-0.5 text-xs text-white/40">{ago(a.at)}</p>
              </div>
              {i === 0 && (
                <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-400">{t.fresh}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── My accounts ─────────────────────────────────────────────
export function MyAccounts({ accounts, locale, dict }: { accounts: AccountView[]; locale: Locale; dict: Dictionary }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card">
      <h3 className="flex items-center gap-2 text-lg font-black text-white">
        <LayersIcon size={20} className="text-brand-400" />
        {dict.dash2.myAccounts}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {accounts.slice(0, 4).map((a) => {
          const label =
            dict.plansPage.typeLabels[a.accountType as keyof typeof dict.plansPage.typeLabels] ?? a.accountType;
          const pct = Math.max(0, Math.min(100, a.metrics.progressPct));
          return (
            <li key={a.id}>
              <Link
                href={path(locale, '/dashboard/accounts')}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3 transition-colors hover:border-brand-500/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="font-mono text-sm font-bold text-white/70">#{a.accountNumber}</span>
                    <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-400">{label}</span>
                    <span dir="ltr" className="font-sans text-base font-black text-white">{usd(a.balance, 0)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-800">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span dir="ltr" className="text-xs font-bold text-white/60">{Math.round(pct)}%</span>
                  </div>
                </div>
                <ChevronIcon dir="left" size={16} className="shrink-0 text-white/30 ltr:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Plan summary cards ──────────────────────────────────────
export function PlansMini({ plans, locale, dict }: { plans: PlanView[]; locale: Locale; dict: Dictionary }) {
  const types = ['TWO_STEP', 'ONE_STEP', 'INSTANT'] as const;
  const c = dict.home.card;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-paper p-5 shadow-card lg:col-span-2 2xl:col-span-1">
      <h3 className="flex items-center gap-2 text-lg font-black text-white">
        <LayersIcon size={20} className="text-brand-400" />
        {dict.dash2.plansTitle}
      </h3>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {types.map((type, i) => {
          const p = plans.find((x) => x.accountType === type);
          if (!p) return <div key={type} />;
          const rows: Array<[string, string]> =
            type === 'TWO_STEP'
              ? [[c.targetP1, `${p.profitTarget}%`], [c.targetP2, `${p.profitTargetP2}%`], [c.daily, `${p.dailyDrawdown}%`], [c.total, `${p.maxDrawdown}%`]]
              : type === 'INSTANT'
                ? [[c.daily, c.none], [c.total, `${p.maxDrawdown}%`]]
                : [[c.target, `${p.profitTarget}%`], [c.daily, `${p.dailyDrawdown}%`], [c.total, `${p.maxDrawdown}%`]];
          return (
            <Link
              key={type}
              href={`${path(locale, '/plans')}?type=${type}`}
              className={
                'rounded-xl border p-3 text-center transition-colors hover:border-brand-500 ' +
                (i === 0 ? 'border-2 border-brand-500 bg-brand-500/[0.05]' : 'border-white/[0.08]')
              }
            >
              <span className="mx-auto flex h-8 w-8 items-center justify-center text-brand-400">
                {type === 'TWO_STEP' ? <BarsIcon size={22} /> : type === 'ONE_STEP' ? <BoltIcon size={22} /> : <CopyIcon size={22} />}
              </span>
              <p className="mt-1 text-sm font-extrabold text-white">
                {dict.plansPage.typeLabels[type]}
              </p>
              <dl className="mt-2 space-y-1 text-[11px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-1">
                    <dt className="text-start leading-tight text-white/55">{k}</dt>
                    <dd className="shrink-0 font-bold text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
