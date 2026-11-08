'use client';

import { useState } from 'react';

type Item = { q: string; a: string };

export function FaqAccordion({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-4xl divide-y divide-brand-400/10 overflow-hidden rounded-2xl border border-brand-400/25 bg-gradient-to-b from-teal-700/40 to-ink-900/80 shadow-[0_0_30px_-18px_rgba(46,235,158,0.6)]">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start transition-colors hover:bg-brand-400/[0.04]"
            >
              <span className="text-base font-medium text-white">{item.q}</span>
              <span
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-brand-300 transition-transform duration-300 ' +
                  (isOpen ? 'rotate-45' : '')
                }
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{
                gridTemplateRows: isOpen ? '1fr' : '0fr',
              }}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-5 text-sm leading-relaxed text-white/60">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
