import type { Dictionary } from '@/i18n';

export function Testimonials({ dict }: { dict: Dictionary }) {
  const t = dict.testimonials;
  return (
    <section className="section">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t.title}</p>
          <h2 className="mt-3 h-section">{t.subtitle}</h2>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {t.items.map((item, i) => (
            <figure
              key={i}
              className="card flex flex-col p-6 transition-colors hover:border-white/15"
            >
              <div className="flex gap-0.5 text-gold-400" aria-hidden>
                {Array.from({ length: 5 }).map((_, s) => (
                  <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m12 2 3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9 12 2z" />
                  </svg>
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-white/70">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 font-semibold text-brand-300">
                  {item.name.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-brand-300/80">{item.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
