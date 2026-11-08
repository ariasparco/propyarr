'use client';

import { useEffect, useRef } from 'react';
import type { PublicReview } from '@/lib/data';
import { Avatar } from './Avatar';
import { ChevronIcon, StarIcon } from '@/components/site/Icons';

/**
 * Approved reviews in a row that scrolls on its own and wraps around.
 * Hovering pauses it; the arrows move one card at a time.
 */
export function ReviewsCarousel({
  reviews,
  prevLabel,
  nextLabel,
}: {
  reviews: PublicReview[];
  prevLabel: string;
  nextLabel: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  // +1 moves toward the reading end of the row (left in RTL).
  function step(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-card]');
    const width = (card?.offsetWidth ?? 300) + 16;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    if (dir === 1 && pos >= max - 4) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    el.scrollBy({ left: (rtl ? -1 : 1) * dir * width, behavior: 'smooth' });
  }

  useEffect(() => {
    if (reviews.length < 2) return;
    const id = setInterval(() => {
      if (!paused.current) step(1);
    }, 4000);
    return () => clearInterval(id);
  }, [reviews.length]);

  if (reviews.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={prevLabel}
        onClick={() => step(-1)}
        className="absolute -start-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-paper text-white/70 shadow-card hover:text-brand-300 sm:flex"
      >
        <ChevronIcon dir="right" size={18} className="ltr:rotate-180" />
      </button>
      <div
        ref={track}
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((r) => (
          <figure
            key={r.id}
            data-card
            className="flex w-[85%] shrink-0 snap-start flex-col rounded-2xl border border-white/[0.07] bg-paper p-5 shadow-card sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]"
          >
            <figcaption className="flex items-center gap-3">
              <Avatar gender={r.gender} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-white">{r.name}</p>
                <span className="flex gap-0.5 text-gold-400" aria-label={`${r.rating}/5`}>
                  {Array.from({ length: 5 }).map((_, s) => (
                    <StarIcon key={s} size={14} className={s < r.rating ? '' : 'opacity-25'} />
                  ))}
                </span>
              </div>
            </figcaption>
            <blockquote className="mt-3 text-sm leading-relaxed text-white/70">{r.text}</blockquote>
          </figure>
        ))}
      </div>
      <button
        type="button"
        aria-label={nextLabel}
        onClick={() => step(1)}
        className="absolute -end-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-paper text-white/70 shadow-card hover:text-brand-300 sm:flex"
      >
        <ChevronIcon dir="left" size={18} className="ltr:rotate-180" />
      </button>
    </div>
  );
}
