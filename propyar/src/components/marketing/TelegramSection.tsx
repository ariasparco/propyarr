import { Logo } from '@/components/site/Logo';
import { SITE } from '@/lib/constants';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

export function TelegramSection({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const c = dict.community;
  const subs = locale === 'fa' ? '+۵٬۰۰۰' : '5,000+';

  const tiles = [
    { label: c.tiles.announcements, icon: <BellIcon /> },
    { label: c.tiles.analysis, icon: <ChartIcon /> },
    { label: c.tiles.payments, icon: <WalletIcon /> },
    { label: c.tiles.education, icon: <CapIcon /> },
  ];

  return (
    <section className="section">
      <div className="container-x">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">{c.eyebrow}</p>
          <h2 className="mt-3 h-section">{c.title}</h2>
          <p className="mt-4 text-white/55">{c.subtitle}</p>
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-4xl border border-teal-700/40 bg-teal-800/30 p-6 shadow-card backdrop-blur-sm sm:p-8">
          {/* Header: identity + live chart */}
          <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
            <div>
              <Logo name={dict.brand} />
              <p className="mt-3 font-mono text-sm text-brand-300">
                @{SITE.telegram}
              </p>
              <p className="mt-0.5 text-xs text-white/50">
                {subs} {c.subscribers}
              </p>
            </div>

            <div className="w-full rounded-2xl border border-white/[0.06] bg-ink-950/40 p-3 sm:w-72">
              <Candles />
            </div>
          </div>

          {/* Tagline */}
          <p className="mt-6 text-white/75">{c.tagline}</p>

          {/* Quick-link tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-ink-900/50 px-3 py-4 text-center transition-colors hover:border-brand-500/40 hover:bg-ink-900/80"
              >
                <span className="text-brand-400">{t.icon}</span>
                <span className="text-xs font-medium text-white/80">
                  {t.label}
                </span>
              </div>
            ))}
          </div>

          {/* Join CTA */}
          <a
            href={`https://t.me/${SITE.telegram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-6 w-full"
          >
            <TelegramIcon />
            {c.join}
          </a>
        </div>
      </div>
    </section>
  );
}

// Realistic candlestick uptrend in PRICE space: [open, close, high, low]
// (higher value = higher price). Mapped to SVG coords inside <Candles/>.
const OHLC: [number, number, number, number][] = [
  [22, 28, 31, 20],
  [28, 25, 30, 23],
  [25, 33, 36, 24],
  [33, 31, 37, 29],
  [31, 41, 44, 30],
  [41, 45, 48, 39],
  [45, 42, 49, 40],
  [42, 52, 55, 41],
  [52, 57, 60, 50],
  [57, 54, 61, 52],
  [54, 64, 67, 53],
  [64, 70, 73, 62],
  [70, 67, 74, 65],
  [67, 78, 81, 66],
  [78, 85, 89, 76],
];

// Catmull-Rom → cubic-bézier smoothing for a soft trend line.
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return '';
  const f = (v: number) => v.toFixed(1);
  const d = [`M ${f(points[0][0])} ${f(points[0][1])}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2[0])} ${f(p2[1])}`);
  }
  return d.join(' ');
}

function Candles() {
  const W = 260;
  const H = 132;
  const padX = 16;
  const padTop = 12;
  const padBottom = 14;
  const n = OHLC.length;
  const vals = OHLC.flat();
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (n - 1);
  const y = (p: number) =>
    padTop + ((max - p) / (max - min)) * (H - padTop - padBottom);
  const bw = 7;
  const trendPts = OHLC.map((c, i) => [x(i), y(c[1])] as [number, number]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" aria-hidden>
      <defs>
        <linearGradient id="tl" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#14D98A" stopOpacity="0.12" />
          <stop offset="0.5" stopColor="#2EEB9E" />
          <stop offset="1" stopColor="#8FFCCD" />
        </linearGradient>
      </defs>

      {/* candles — green when up, gold when down */}
      {OHLC.map(([o, c, h, l], i) => {
        const up = c >= o;
        const color = up ? '#2FBE87' : '#D9A72E';
        const cx = x(i);
        const bodyTop = y(Math.max(o, c));
        const bodyH = Math.max(2, Math.abs(y(o) - y(c)));
        return (
          <g key={i}>
            <line
              x1={cx}
              y1={y(h)}
              x2={cx}
              y2={y(l)}
              stroke={color}
              strokeWidth="1.3"
              strokeLinecap="round"
              opacity="0.9"
            />
            <rect
              x={cx - bw / 2}
              y={bodyTop}
              width={bw}
              height={bodyH}
              rx="1.4"
              fill={color}
            />
          </g>
        );
      })}

      {/* smooth gold trend line */}
      <path
        d={smoothPath(trendPts)}
        fill="none"
        stroke="url(#tl)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" rx="0.5" />
      <rect x="12.5" y="8" width="3" height="10" rx="0.5" />
      <rect x="18" y="5" width="3" height="13" rx="0.5" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M16 12h4" />
      <circle cx="16" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
function CapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 8 10-4 10 4-10 4Z" />
      <path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.9.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6 13.3l-4.9-1.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5Z" />
    </svg>
  );
}
