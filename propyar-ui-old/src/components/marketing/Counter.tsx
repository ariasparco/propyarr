'use client';

import { useEffect, useRef, useState } from 'react';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function localize(value: number, locale: string) {
  const s = value.toLocaleString('en-US');
  return locale === 'fa' ? s.replace(/\d/g, (d) => FA_DIGITS[+d]) : s;
}

export function Counter({
  to,
  prefix = '',
  suffix = '',
  locale,
  duration = 1500,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  locale: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || started.current) return;
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            setValue(Math.round(eased * to));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {localize(value, locale)}
      {suffix}
    </span>
  );
}
