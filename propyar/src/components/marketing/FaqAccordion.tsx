'use client';

import { useState } from 'react';

type Item = { q: string; a: string };

export function FaqAccordion({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-2.5">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className={
              'overflow-hidden rounded-xl border bg-paper shadow-card transition-colors ' +
              (isOpen ? 'border-brand-500/40' : 'border-white/[0.07]')
            }
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start"
            >
              <span className="text-[15px] font-bold text-white">{item.q}</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={
                  'shrink-0 text-white/50 transition-transform duration-300 ' +
                  (isOpen ? 'rotate-180 text-brand-400' : '')
                }
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm leading-relaxed text-white/65">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
