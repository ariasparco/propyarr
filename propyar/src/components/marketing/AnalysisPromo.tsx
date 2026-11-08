import Link from 'next/link';
import Image from 'next/image';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { BarsIcon, CrownIcon } from '@/components/site/Icons';

// The analysis-panel feature: copy on one side, the laptop mock-up on the other.
export function AnalysisPromo({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const v = dict.home.v2;
  return (
    <section className="container-x mt-14">
      <div className="relative grid items-center gap-6 overflow-hidden rounded-3xl border border-brand-500/15 bg-gradient-to-l from-paper via-teal-800/60 to-teal-700/70 p-6 shadow-card sm:p-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="relative z-10 text-center lg:text-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400 px-3 py-1 text-xs font-extrabold text-[#3A2A00]">
            <CrownIcon size={14} />
            {v.analysisBadge}
          </span>
          <h2 className="mt-4 font-display text-3xl font-black text-white sm:text-4xl">
            {v.analysisTitle1}{' '}
            <span className="text-brand-400">{v.analysisTitle2}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-white/65 lg:mx-0">
            {v.analysisText}
          </p>
          <Link href={path(locale, '/dashboard')} className="btn-primary btn-lg mt-6">
            <BarsIcon size={18} />
            {v.analysisCta}
          </Link>
        </div>
        <div className="relative">
          <Image
            src="/images/home/laptop.jpg"
            alt=""
            width={1025}
            height={435}
            className="h-auto w-full"
            style={{
              maskImage: 'radial-gradient(85% 90% at 50% 50%, #000 70%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(85% 90% at 50% 50%, #000 70%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </section>
  );
}
