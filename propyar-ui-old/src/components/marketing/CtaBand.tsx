import Link from 'next/link';
import Image from 'next/image';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { RocketIcon } from '@/components/site/Icons';

const fade = (side: 'left' | 'right') => {
  const mask = `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, #000 55%, transparent)`;
  return { maskImage: mask, WebkitMaskImage: mask };
};

export function CtaBand({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const h = dict.home;
  return (
    <section className="py-12 sm:py-16">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl border border-brand-400/40 bg-gradient-to-b from-teal-800/60 to-ink-900 shadow-[0_0_40px_-16px_rgba(46,235,158,0.7)]">
          {/* Mountain + flag on the right, candles on the left (as in the design) */}
          <Image
            src="/images/home/cta-peak.jpg"
            alt=""
            width={552}
            height={276}
            className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-auto md:block"
            style={fade('right')}
          />
          <Image
            src="/images/home/cta-candles.jpg"
            alt=""
            width={544}
            height={276}
            className="pointer-events-none absolute bottom-0 left-0 hidden h-full w-auto md:block"
            style={fade('left')}
          />
          <div className="relative px-6 py-8 text-center sm:py-10">
            <h2 className="font-display text-2xl font-extrabold text-white sm:text-[1.9rem]">
              {h.ctaTitle}
            </h2>
            <p className="mt-2 text-white/75">{h.ctaSubtitle}</p>
            <Link
              href={path(locale, '/register')}
              className="btn-primary btn-lg mt-6 min-w-[13rem] rounded-xl text-lg"
            >
              <RocketIcon size={22} />
              {dict.common.startChallenge}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
