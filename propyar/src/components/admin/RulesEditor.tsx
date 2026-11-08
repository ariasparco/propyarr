'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type RulesValues = {
  consistencyRulePercent: number;
  fundedMinTradingDays: number;
  hftCooldownMinutes: number;
  minHoldSeconds: number;
  dayResetUtcOffset: number;
  allowedSymbols: string[];
  weekendHoldingAllowed: boolean;
  newsTradingAllowed: boolean;
};

export type RulesEditorT = {
  consistency: string;
  fundedMinDays: string;
  cooldown: string;
  minHold: string;
  dayReset: string;
  dayResetHint: string;
  symbols: string;
  symbolsHint: string;
  weekendHolding: string;
  newsTrading: string;
  allowed: string;
  notAllowed: string;
  save: string;
  saving: string;
  saved: string;
  failed: string;
};

export function RulesEditor({
  initial,
  t,
}: {
  initial: RulesValues;
  t: RulesEditorT;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );

  function set<K extends keyof RulesValues>(key: K, value: RulesValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setState('idle');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    try {
      const res = await fetch('/api/admin/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          allowedSymbols: values.allowedSymbols
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error('failed');
      setState('saved');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  const numbers: Array<{
    key:
      | 'consistencyRulePercent'
      | 'fundedMinTradingDays'
      | 'hftCooldownMinutes'
      | 'minHoldSeconds'
      | 'dayResetUtcOffset';
    label: string;
    step: number;
    min?: number;
    hint?: string;
  }> = [
    { key: 'consistencyRulePercent', label: t.consistency, step: 1 },
    { key: 'fundedMinTradingDays', label: t.fundedMinDays, step: 1 },
    { key: 'hftCooldownMinutes', label: t.cooldown, step: 1 },
    { key: 'minHoldSeconds', label: t.minHold, step: 5 },
    {
      key: 'dayResetUtcOffset',
      label: t.dayReset,
      step: 1,
      min: -12,
      hint: t.dayResetHint,
    },
  ];

  const toggles: Array<{
    key: 'weekendHoldingAllowed' | 'newsTradingAllowed';
    label: string;
  }> = [
    { key: 'weekendHoldingAllowed', label: t.weekendHolding },
    { key: 'newsTradingAllowed', label: t.newsTrading },
  ];

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {numbers.map((f) => (
          <div
            key={f.key}
            className="rounded-2xl border border-line bg-ink-800/60 px-5 py-4"
          >
            <label htmlFor={f.key} className="field-label">
              {f.label}
            </label>
            <input
              id={f.key}
              type="number"
              step={f.step}
              min={f.min ?? 0}
              value={values[f.key]}
              onChange={(e) => set(f.key, Number(e.target.value))}
              className="field-input mt-1 py-2"
              dir="ltr"
            />
            {f.hint && (
              <p className="mt-1.5 text-xs text-white/40">{f.hint}</p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-ink-800/60 px-5 py-4">
        <label htmlFor="symbols" className="field-label">
          {t.symbols}
        </label>
        <input
          id="symbols"
          value={values.allowedSymbols.join(', ')}
          onChange={(e) => set('allowedSymbols', e.target.value.split(','))}
          className="field-input mt-1 py-2 font-mono"
          dir="ltr"
        />
        <p className="mt-1.5 text-xs text-white/40">{t.symbolsHint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {toggles.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => set(f.key, !values[f.key])}
            className="flex items-center justify-between rounded-2xl border border-line bg-ink-800/60 px-5 py-4 text-start transition-colors hover:border-white/20"
          >
            <span className="text-sm text-white/70">{f.label}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                values[f.key]
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'bg-red-500/15 text-red-300'
              }`}
            >
              {values[f.key] ? t.allowed : t.notAllowed}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === 'saving'}
          className="btn-primary px-8 disabled:opacity-70"
        >
          {state === 'saving' ? t.saving : t.save}
        </button>
        {state === 'saved' && (
          <span className="text-sm text-emerald-300">{t.saved}</span>
        )}
        {state === 'error' && (
          <span className="text-sm text-red-300">{t.failed}</span>
        )}
      </div>
    </form>
  );
}
