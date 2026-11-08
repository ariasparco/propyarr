import Link from 'next/link';
import Image from 'next/image';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { RocketIcon } from '@/components/site/Icons';

// Dark-green call to action that closes the inner pages.
export function CtaBand({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const h = dict.home;
  return (
    <section className="py-12 sm:py-14">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#03261B] via-[#0B4A31] to-[#03261B] text-paper shadow-glow-teal">
          <Image
            src="/images/home/bull.jpg"
            alt=""
            width={1262}
            height={490}
            className="pointer-events-none absolute inset-y-0 left-0 hidden h-full w-auto opacity-70 md:block"
            style={{
              maskImage: 'linear-gradient(to right, #000 40%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, #000 40%, transparent 100%)',
            }}
          />
          <div className="relative px-6 py-10 text-center md:ps-[40%] md:text-start">
            <h2 className="font-display text-2xl font-black sm:text-3xl">{h.ctaTitle}</h2>
            <p className="mt-2 text-paper/80">{h.ctaSubtitle}</p>
            <Link
              href={path(locale, '/register')}
              className="btn btn-lg mt-6 min-w-[12rem] bg-gradient-to-l from-[#19C27A] to-[#2EEB9E] font-extrabold text-[#03261B] hover:brightness-105"
            >
              <RocketIcon size={20} />
              {dict.common.startChallenge}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
