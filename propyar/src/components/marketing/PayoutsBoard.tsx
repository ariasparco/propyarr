'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PublicPayout } from '@/lib/data';
import { txUrl, shortHash } from '@/lib/explorer';
import { ExternalIcon, TetherIcon, ChevronIcon } from '@/components/site/Icons';

type T = {
  payoutsTitle: string;
  payoutsSub: string;
  payoutsEmpty: string;
  track: string;
  allPayouts: string;
  cols: { trader: string; amount: string; network: string; date: string; tx: string };
  prev: string;
  next: string;
};

/**
 * Latest paid payouts, each with a link to its transaction on the explorer.
 * Pages turn on their own every few seconds; the arrows take over manually.
 * Empty until the first payout is marked paid with a hash.
 */
export function PayoutsBoard({
  items,
  locale,
  t,
  allHref,
  perPage = 5,
}: {
  items: PublicPayout[];
  locale: string;
  t: T;
  allHref?: string;
  perPage?: number;
}) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (pages < 2) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), 6000);
    return () => clearInterval(id);
  }, [pages, page]);

  const shown = items.slice(page * perPage, page * perPage + perPage);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-paper p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-white">{t.payoutsTitle}</h3>
          <p className="mt-1 max-w-xl text-sm text-white/55">{t.payoutsSub}</p>
        </div>
        {allHref && items.length > 0 && (
          <Link href={allHref} className="btn-ghost py-2 text-xs">
            {t.allPayouts}
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-500/20 bg-brand-500/[0.03] px-6 py-10 text-center">
          <TetherIcon size={40} />
          <p className="max-w-md text-sm leading-relaxed text-white/60">{t.payoutsEmpty}</p>
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-xs text-white/45">
                  <th className="px-3 py-2 text-start font-semibold">{t.cols.network}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t.cols.trader}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t.cols.amount}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t.cols.date}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t.cols.tx}</th>
                </tr>
              </thead>
              <tbody key={page} className="animate-fade-up">
                {shown.map((p) => (
                  <tr key={p.id} className="border-t border-white/[0.06]">
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2 font-semibold text-white/80">
                        <TetherIcon size={24} />
                        USDT <span className="text-xs text-white/40">{p.network}</span>
                      </span>
                    </td>
                    <td dir="ltr" className="px-3 py-3 text-start font-semibold text-white">
                      {p.name}
                    </td>
                    <td dir="ltr" className="px-3 py-3 text-start font-sans text-base font-black text-brand-400">
                      ${p.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-white/55">{date(p.paidAt)}</td>
                    <td className="px-3 py-3 text-end">
                      <a
                        href={txUrl(p.txHash, p.network) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={p.txHash}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/25 bg-brand-500/[0.07] px-2.5 py-1.5 text-xs font-bold text-brand-300 transition-colors hover:bg-brand-500/15"
                      >
                        <ExternalIcon size={13} />
                        {t.track}
                        <span dir="ltr" className="hidden font-mono font-medium text-white/45 sm:inline">
                          {shortHash(p.txHash)}
                        </span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label={t.prev}
                onClick={() => setPage((p) => (p - 1 + pages) % pages)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/60 hover:border-brand-500 hover:text-brand-300"
              >
                <ChevronIcon dir="right" size={16} className="ltr:rotate-180" />
              </button>
              <div className="flex gap-1.5">
                {Array.from({ length: pages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${i + 1}`}
                    onClick={() => setPage(i)}
                    className={'h-2 rounded-full transition-all ' + (i === page ? 'w-5 bg-brand-500' : 'w-2 bg-white/20')}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label={t.next}
                onClick={() => setPage((p) => (p + 1) % pages)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/60 hover:border-brand-500 hover:text-brand-300"
              >
                <ChevronIcon dir="left" size={16} className="ltr:rotate-180" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
