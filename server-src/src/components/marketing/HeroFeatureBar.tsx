import type { Dictionary } from '@/i18n';

const HEX = 'M22 3 L38 12 L38 32 L22 41 L6 32 L6 12 Z';

const glyphs = [
  // Smart investment — upward trend
  <path key="g" d="M14 28l5-5 4 3 7-8M27 18h4v4" />,
  // Fast payouts — lightning
  <path key="g" d="M24 12l-7 11h5l-2 9 8-12h-5l1-8z" />,
  // 24/7 support — headset
  <>
    <path key="a" d="M14 24v-1a8 8 0 0 1 16 0v1" />
    <rect key="b" x="12" y="24" width="4" height="7" rx="1.5" />
    <rect key="c" x="28" y="24" width="4" height="7" rx="1.5" />
    <path key="d" d="M30 31v1a3 3 0 0 1-3 3h-2" />
  </>,
  // Transparent rules — shield check
  <path key="g" d="M22 13l-7 2.5V21c0 4 3 6.5 7 8 4-1.5 7-4 7-8v-5.5L22 13zM19 21.5l2.2 2.2L26 19" />,
];

export function HeroFeatureBar({ dict }: { dict: Dictionary }) {
  const items = dict.heroBar.items;
  return (
    <section className="relative z-10 border-b border-white/[0.06] bg-ink-900/85 backdrop-blur-sm">
      <div className="container-x grid grid-cols-2 gap-x-4 gap-y-6 py-6 md:grid-cols-4">
        {items.map((item, i) => (
          <div
            key={item.title}
            className={
              'flex items-center gap-3 md:px-6 ' +
              (i > 0 ? 'md:border-s md:border-white/[0.07]' : '')
            }
          >
            <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center transition-transform duration-300 hover:scale-110">
              <svg viewBox="0 0 44 44" fill="none" className="absolute inset-0">
                <path
                  d={HEX}
                  stroke="#C9A227"
                  strokeWidth="1.2"
                  fill="rgba(201,162,39,0.06)"
                  strokeLinejoin="round"
                />
              </svg>
              <svg
                width="44"
                height="44"
                viewBox="0 0 44 44"
                fill="none"
                stroke="#DEB84F"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative"
              >
                {glyphs[i]}
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {item.title}
              </p>
              <p className="truncate text-xs text-white/50">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
