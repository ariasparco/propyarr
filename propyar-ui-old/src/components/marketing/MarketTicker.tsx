'use client';

import { useEffect, useState } from 'react';

// NOTE: illustrative quotes for the landing page. In production, feed these from a
// real market-data source (broker WebSocket / quotes API) — the shape stays the same.
type Quote = { s: string; p: number; d: number };

const BASE: Quote[] = [
  { s: 'EUR/USD', p: 1.0842, d: 0.12 },
  { s: 'GBP/USD', p: 1.2715, d: -0.08 },
  { s: 'XAU/USD', p: 2338.4, d: 0.54 },
  { s: 'US30', p: 39112, d: 0.31 },
  { s: 'NAS100', p: 18240, d: -0.22 },
  { s: 'BTC/USD', p: 64230, d: 1.42 },
  { s: 'ETH/USD', p: 3140.2, d: -0.63 },
  { s: 'USOIL', p: 81.35, d: 0.27 },
  { s: 'USD/JPY', p: 156.22, d: 0.09 },
  { s: 'SPX500', p: 5284, d: 0.18 },
];

function fmt(p: number) {
  return p >= 1000
    ? p.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : p.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: p >= 100 ? 2 : 4,
      });
}

export function MarketTicker() {
  const [items, setItems] = useState<Quote[]>(BASE);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setItems((prev) =>
        prev.map((it) => {
          const jitter = (Math.random() - 0.5) * it.p * 0.0007;
          const p = Math.max(0.0001, it.p + jitter);
          const d = +(it.d + (Math.random() - 0.5) * 0.05).toFixed(2);
          return { s: it.s, p, d };
        }),
      );
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const row = [...items, ...items]; // duplicate for a seamless loop

  return (
    <div className="relative overflow-hidden border-b border-white/[0.06] bg-ink-950/80 backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-ink-950 to-transparent" />
      {/* No gap between items: the spacing lives inside each one (pe-7). A flex
          gap would add an extra space between the two copies, so translating
          -50% would not land exactly on the seam and the loop would jump. */}
      <div
        dir="ltr"
        className="flex w-max animate-marquee py-2.5 hover:[animation-play-state:paused]"
      >
        {row.map((it, i) => {
          const up = it.d >= 0;
          return (
            <span
              key={i}
              className="flex items-center gap-2 whitespace-nowrap pe-7 text-xs"
            >
              <span className="font-semibold tracking-wide text-white/85">
                {it.s}
              </span>
              <span className="font-mono tabular-nums text-white/55">
                {fmt(it.p)}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 font-medium ${
                  up ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                <span className="text-[0.6rem]">{up ? '▲' : '▼'}</span>
                {Math.abs(it.d).toFixed(2)}%
              </span>
              <span className="text-white/15">•</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
