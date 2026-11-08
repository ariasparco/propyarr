import Link from 'next/link';
import Image from 'next/image';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { LayersIcon, RocketIcon } from '@/components/site/Icons';

// Dark-green banner with the bull artwork, the one dark block at the top of
// the otherwise light page. The feature bar overlaps its lower edge.
export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const v = dict.home.v2;
  return (
    <section className="relative overflow-hidden bg-[#012A22] pb-20 text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(40rem 22rem at 30% 40%, rgba(32,200,120,0.28), transparent 70%), radial-gradient(30rem 20rem at 90% 10%, rgba(32,200,120,0.12), transparent 70%), linear-gradient(180deg, #013326 0%, #001F1A 100%)',
        }}
      />
      {/* Bull on the left (end side in RTL), fading into the banner colour. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[58%] lg:block">
        <Image
          src="/images/home/bull.jpg"
          alt=""
          fill
          priority
          sizes="60vw"
          className="object-cover object-left"
          style={{
            maskImage: 'linear-gradient(to right, #000 62%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, #000 62%, transparent 100%)',
          }}
        />
      </div>

      <div className="container-x relative grid min-h-[300px] items-center pt-10 lg:grid-cols-2 lg:pt-12">
        <div className="text-center lg:text-start">
          <h1 className="font-display text-4xl font-black leading-tight sm:text-5xl lg:text-[3.25rem]">
            <span className="block">{v.heroTitle1}</span>
            <span className="block text-[#2EEB9E] drop-shadow-[0_0_20px_rgba(46,235,158,0.45)]">
              {v.heroTitle2}
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-paper/85 sm:text-lg lg:mx-0">
            {v.heroText}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link
              href={path(locale, '/register')}
              className="btn btn-lg min-w-[11rem] bg-gradient-to-l from-[#19C27A] to-[#2EEB9E] font-extrabold text-[#03261B] shadow-[0_10px_30px_-10px_rgba(46,235,158,0.8)] hover:brightness-105"
            >
              <RocketIcon size={20} />
              {dict.common.startChallenge}
            </Link>
            <Link
              href={path(locale, '/plans')}
              className="btn btn-lg min-w-[11rem] border border-paper/70 bg-transparent font-bold text-paper hover:bg-paper/10"
            >
              <LayersIcon size={20} />
              {dict.common.viewPlans}
            </Link>
          </div>
        </div>
        {/* Mobile: the artwork below the text. */}
        <div className="relative mx-auto mt-8 aspect-[2.6/1] w-full max-w-lg lg:hidden">
          <Image
            src="/images/home/bull.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            style={{
              maskImage: 'radial-gradient(closest-side, #000 70%, transparent)',
              WebkitMaskImage: 'radial-gradient(closest-side, #000 70%, transparent)',
            }}
          />
        </div>
      </div>
    </section>
  );
}
