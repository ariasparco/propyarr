'use client';

import { useEffect, useState } from 'react';
import { CopyIcon, PercentIcon } from './Icons';

type Code = { code: string; percent: number; label: string | null };

/**
 * Strip above the header advertising the site's active discount codes, each
 * with a one-click copy. Several codes rotate in pages; nothing renders when
 * staff have not put any code in the banner.
 */
export function DiscountStrip({
  codes,
  t,
  locale,
}: {
  codes: Code[];
  t: { discountTitle: string; copy: string; copied: string; off: string };
  locale: string;
}) {
  const perPage = 2;
  const pages = Math.max(1, Math.ceil(codes.length / perPage));
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (pages < 2) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), 5000);
    return () => clearInterval(id);
  }, [pages]);

  if (codes.length === 0) return null;
  const shown = codes.slice(page * perPage, page * perPage + perPage);
  const num = (n: number) =>
    locale === 'fa' ? n.toLocaleString('fa-IR') : String(n);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the code is visible to copy by hand */
    }
  }

  return (
    <div className="bg-gradient-to-l from-[#03261B] via-[#064530] to-[#03261B] text-paper">
      <div className="container-x flex min-h-[46px] flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-1.5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-400 text-[#3A2A00]">
            <PercentIcon size={15} />
          </span>
          {t.discountTitle}
        </div>

        <div key={page} className="flex animate-fade-up flex-wrap items-center gap-2">
          {shown.map((c) => (
            <div
              key={c.code}
              className="flex items-center gap-2 rounded-full border border-paper/20 bg-paper/10 py-1 pe-1 ps-3 text-xs"
            >
              <span className="rounded-full bg-gold-400 px-2 py-0.5 font-extrabold text-[#3A2A00]">
                {num(c.percent)}٪ {t.off}
              </span>
              <span dir="ltr" className="font-mono font-bold tracking-wider">
                {c.code}
              </span>
              {c.label && <span className="hidden text-paper/70 sm:inline">{c.label}</span>}
              <button
                type="button"
                onClick={() => copy(c.code)}
                className="flex items-center gap-1 rounded-full bg-paper/15 px-2 py-1 font-semibold transition-colors hover:bg-paper/25"
              >
                <CopyIcon size={13} />
                {copied === c.code ? t.copied : t.copy}
              </button>
            </div>
          ))}
          {pages > 1 && (
            <div className="flex gap-1 ps-1">
              {Array.from({ length: pages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${i + 1}`}
                  onClick={() => setPage(i)}
                  className={'h-1.5 rounded-full transition-all ' + (i === page ? 'w-4 bg-gold-400' : 'w-1.5 bg-paper/40')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
