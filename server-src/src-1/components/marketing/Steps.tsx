import { Reveal } from './Reveal';
import type { Dictionary } from '@/i18n';

const stepIcons = [
  // 1) choose a challenge — target
  <svg key="1" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>,
  // 2) reach the target — trending up
  <svg key="2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16.5 9 10l4 4 7.5-7.5" />
    <path d="M15.5 6.5H21V12" />
  </svg>,
  // 3) get funded & paid — banknote
  <svg key="3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </svg>,
];

export function Steps({ dict }: { dict: Dictionary }) {
  const s = dict.steps;
  return (
    <section id="how" className="section relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 -z-10 h-72 w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-brand-500/[0.06] blur-[110px]"
      />
      <div className="container-x">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{s.title}</p>
          <h2 className="mt-3 h-section">{s.subtitle}</h2>
        </Reveal>

        <div className="relative mt-16">
          {/* Animated connecting rail (desktop) */}
          <div
            aria-hidden
            className="absolute inset-x-[14%] top-7 hidden h-0.5 overflow-hidden rounded-full bg-white/[0.08] md:block"
          >
            <div className="h-full w-full animate-rail-shimmer bg-[linear-gradient(90deg,transparent,rgba(201,162,39,0.85),transparent)] bg-[length:35%_100%] bg-no-repeat" />
          </div>

          <div className="grid gap-x-6 gap-y-10 md:grid-cols-3">
            {s.items.map((item, i) => (
              <Reveal key={item.step} delay={i * 130}>
                <div className="group relative text-start">
                  {/* Node */}
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center">
                    <span className="absolute inset-0 animate-[spin_9s_linear_infinite] rounded-2xl bg-[conic-gradient(from_0deg,#C9A227,#EACF82,#A6841E,#C9A227)] opacity-90 blur-[0.5px]" />
                    <span className="absolute inset-[2px] rounded-[14px] bg-ink-900" />
                    <span className="relative text-brand-300 transition-transform duration-300 group-hover:scale-110">
                      {stepIcons[i]}
                    </span>
                  </div>

                  {/* Card */}
                  <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/[0.07] bg-teal-900/25 p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-500/40 hover:shadow-glow">
                    <h3 className="relative text-xl font-semibold text-white">
                      {item.title}
                    </h3>
                    <p className="relative mt-2 text-sm leading-relaxed text-white/55">
                      {item.desc}
                    </p>
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-0.5 w-0 bg-brand-gradient transition-all duration-500 group-hover:w-full"
                    />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
