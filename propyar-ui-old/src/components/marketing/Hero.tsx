import Link from 'next/link';
import Image from 'next/image';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { LayersIcon, RocketIcon } from '@/components/site/Icons';

export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const h = dict.home;
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(38rem 24rem at 22% 45%, rgba(46,235,158,0.16), transparent 70%), radial-gradient(30rem 20rem at 85% 20%, rgba(46,235,158,0.06), transparent 70%)',
        }}
      />
      <div className="container-x grid items-center gap-8 pb-6 pt-8 lg:grid-cols-[1fr_1.05fr] lg:pt-10">
        <div className="text-center lg:text-start">
          <h1 className="font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-[3.4rem]">
            <span className="block">{h.heroLine1}</span>
            <span className="block">
              {h.heroLine2}{' '}
              <span className="text-brand-400 drop-shadow-[0_0_18px_rgba(46,235,158,0.45)]">
                {h.heroHighlight}
              </span>
            </span>
          </h1>
          <p className="mt-5 text-base text-white/80 sm:text-lg">
            {h.heroSubtitle1}
            <br />
            {h.heroSubtitle2}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start">
            <Link
              href={path(locale, '/register')}
              className="btn-primary btn-lg min-w-[12rem] rounded-xl"
            >
              <RocketIcon size={20} />
              {dict.common.startChallenge}
            </Link>
            <Link
              href={path(locale, '/plans')}
              className="btn-outline btn-lg min-w-[12rem] rounded-xl"
            >
              <LayersIcon size={20} />
              {dict.common.viewPlans}
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[640px]">
          <Image
            src="/images/home/hero.jpg"
            alt=""
            width={1140}
            height={566}
            priority
            className="h-auto w-full select-none"
            style={{
              maskImage:
                'radial-gradient(closest-side, #000 62%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(closest-side, #000 62%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </section>
  );
}
