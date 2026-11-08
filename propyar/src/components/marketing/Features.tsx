import { Reveal } from './Reveal';
import { SpotlightCard } from './SpotlightCard';
import type { Dictionary } from '@/i18n';

const icons = [
  // profit split
  <path key="1" d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  // fast payouts
  <path key="2" d="m13 2-9 12h7l-1 8 9-12h-7l1-8z" />,
  // transparent
  <>
    <circle key="a" cx="12" cy="12" r="3" />
    <path key="b" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
  </>,
  // platforms
  <>
    <rect key="a" x="2" y="3" width="20" height="14" rx="2" />
    <path key="b" d="M8 21h8M12 17v4" />
  </>,
  // risk engine
  <>
    <path key="a" d="M12 2a10 10 0 1 0 10 10" />
    <path key="b" d="M12 12l5-3M12 6v6" />
  </>,
  // security
  <path key="1" d="M12 2 4 5v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5l-8-3zM9.5 12l1.8 1.8L15 10" />,
];

export function Features({ dict }: { dict: Dictionary }) {
  const f = dict.features;
  return (
    <section className="section relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 h-80 bg-teal-800/10 blur-[120px]"
      />
      <div className="container-x">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{f.title}</p>
          <h2 className="mt-3 h-section">{f.subtitle}</h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {f.items.map((item, i) => (
            <Reveal key={item.title} delay={(i % 3) * 90 + Math.floor(i / 3) * 60}>
              <SpotlightCard className="p-6 text-start">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/25 transition-all duration-300 group-hover:bg-brand-500/20 group-hover:ring-brand-500/50 group-hover:shadow-glow">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform duration-300 group-hover:scale-110"
                  >
                    {icons[i]}
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {item.desc}
                </p>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0.5 w-0 bg-brand-gradient transition-all duration-500 group-hover:w-full"
                />
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
