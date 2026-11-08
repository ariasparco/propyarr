import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'good' | 'bad';
}) {
  const valueColor =
    tone === 'good'
      ? 'text-brand-300'
      : tone === 'bad'
        ? 'text-red-300'
        : 'text-white';
  return (
    <div className="card p-5">
      <p className="text-sm text-white/45">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

const tones: Record<string, string> = {
  PASSED: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
  FUNDED: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
  PAID: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
  APPROVED: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
  ACTIVE: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  REQUESTED: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  PENDING: 'border-gold-500/30 bg-gold-500/10 text-gold-300',
  PHASE_1: 'border-gold-500/30 bg-gold-500/10 text-gold-300',
  PHASE_2: 'border-gold-500/30 bg-gold-500/10 text-gold-300',
  FAILED: 'border-red-500/30 bg-red-500/10 text-red-300',
  REJECTED: 'border-red-500/30 bg-red-500/10 text-red-300',
  DISABLED: 'border-red-500/30 bg-red-500/10 text-red-300',
  REFUNDED: 'border-white/15 bg-white/5 text-white/60',
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const tone = tones[status] ?? 'border-white/15 bg-white/5 text-white/60';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-ink-700">
      <div
        className="h-full rounded-full bg-brand-gradient transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
