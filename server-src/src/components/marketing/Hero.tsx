import Image from 'next/image';
import Link from 'next/link';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

export function Hero({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const h = dict.hero;
  const isRtl = locale === 'fa';
  const count = isRtl ? '+۱٬۰۰۰' : '1,000+';

  // Darken the side the text sits on (start side).
  const sideGradient = isRtl
    ? 'bg-gradient-to-l from-ink-950 via-ink-950/60 to-transparent'
    : 'bg-gradient-to-r from-ink-950 via-ink-950/60 to-transparent';

  const content = (
    <div className="max-w-xl animate-fade-up text-start">
      <h1 className="font-display text-4xl font-extrabold leading-[1.18] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)] sm:text-5xl lg:text-6xl">
        {h.title}
        <br />
        <span className="text-gradient">{h.titleHighlight}</span>
      </h1>

      <p className="mt-6 max-w-md text-lg leading-relaxed text-white/80 drop-shadow-[0_1px_12px_rgba(0,0,0,0.6)]">
        {h.subtitle}
      </p>

      <div className="mt-9">
        <Link
          href={path(locale, '/plans')}
          className="btn-primary btn-lg text-base"
        >
          {h.cta1}
          <Arrow />
        </Link>
      </div>

      <div className="mt-11 flex items-center gap-3">
        <div className="flex -space-x-2.5 rtl:space-x-reverse">
          {['#C9A227', '#0F3D3E', '#DEB84F', '#134D4D'].map((c, i) => (
            <span
              key={i}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink-900 ring-1 ring-white/10"
              style={{ background: c }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="rgba(255,255,255,0.78)"
              >
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.7-8 6v2h16v-2c0-3.3-3.6-6-8-6Z" />
              </svg>
            </span>
          ))}
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-bold text-white">{count}</p>
          <p className="text-xs text-white/65">{h.trustline}</p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="relative isolate overflow-hidden bg-ink-950">
      {/* Full hero render at its natural aspect ratio (no cropping) */}
      <div className="relative">
        <Image
          src="/hero-bg.png"
          alt=""
          width={1257}
          height={700}
          priority
          quality={95}
          sizes="100vw"
          className="h-auto w-full select-none"
        />

        {/* Desktop: darken the start side and overlay the text on the image */}
        <div
          aria-hidden
          className={`absolute inset-0 hidden lg:block ${sideGradient}`}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 hidden h-1/4 bg-gradient-to-t from-ink-950 to-transparent lg:block"
        />
        <div className="absolute inset-0 hidden items-start lg:flex">
          <div className="container-x pt-[6vh] xl:pt-[9vh]">{content}</div>
        </div>
      </div>

      {/* Mobile / tablet: text sits below the full image */}
      <div className="container-x py-12 lg:hidden">{content}</div>
    </section>
  );
}

function Arrow() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="rtl:-scale-x-100"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
