'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronIcon, StarIcon } from '@/components/site/Icons';

type Review = { quote: string; name: string; role: string };

export function ReviewSlider({
  reviews,
  prevLabel,
  nextLabel,
}: {
  reviews: Review[];
  prevLabel: string;
  nextLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const count = reviews.length;

  // Auto-advance; any manual navigation restarts the timer.
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 7000);
    return () => clearInterval(id);
  }, [count, index]);

  if (count === 0) return null;
  const r = reviews[index];
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  return (
    <div className="mt-4 flex flex-1 flex-col rounded-xl border border-brand-400/15 bg-ink-900/50 px-3 py-4">
      <div className="flex flex-1 items-center gap-3">
        <button
          type="button"
          aria-label={prevLabel}
          onClick={() => go(-1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 text-white/80 hover:border-brand-300 hover:text-brand-200"
        >
          <ChevronIcon dir="right" size={16} className="ltr:rotate-180" />
        </button>

        <div className="flex flex-1 items-center gap-4">
          <Image
            src="/images/home/avatar.jpg"
            alt=""
            width={80}
            height={80}
            className="h-[72px] w-[72px] shrink-0 rounded-full object-cover ring-2 ring-white/80"
          />
          <div className="min-w-0 flex-1">
            <p key={index} className="animate-fade-up text-[13px] leading-relaxed text-white/85">
              {r.quote}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">
                {r.name} - {r.role}
              </p>
              <span className="flex gap-0.5 text-gold-400" aria-hidden>
                {Array.from({ length: 5 }).map((_, s) => (
                  <StarIcon key={s} size={15} />
                ))}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => go(1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 text-white/80 hover:border-brand-300 hover:text-brand-200"
        >
          <ChevronIcon dir="left" size={16} className="ltr:rotate-180" />
        </button>
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {reviews.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}`}
            onClick={() => setIndex(i)}
            className={
              'h-2 w-2 rounded-full transition-colors ' +
              (i === index ? 'bg-brand-400' : 'bg-white/25')
            }
          />
        ))}
      </div>
    </div>
  );
}
