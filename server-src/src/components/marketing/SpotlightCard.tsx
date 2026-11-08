'use client';

import { useRef, type ReactNode } from 'react';

// Card with a gold spotlight that follows the cursor + hover lift.
export function SpotlightCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group relative h-full overflow-hidden rounded-3xl border border-white/[0.07] bg-teal-900/25 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-500/40 hover:shadow-card-hover ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(240px circle at var(--mx) var(--my), rgba(201,162,39,0.16), transparent 72%)',
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
