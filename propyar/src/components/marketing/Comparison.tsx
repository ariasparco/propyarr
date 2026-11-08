import type { Dictionary } from '@/i18n';

export function Comparison({ dict }: { dict: Dictionary }) {
  const c = dict.comparison;
  return (
    <section className="section">
      <div className="container-x">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">{c.eyebrow}</p>
          <h2 className="mt-3 h-section">{c.title}</h2>
          <p className="mt-4 text-white/55">{c.subtitle}</p>
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-4xl border border-line bg-ink-850/40 shadow-card">
          {/* Header */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr]">
            <div className="px-4 py-5 sm:px-6" />
            <div className="bg-brand-500/[0.12] px-3 py-5 text-center ring-1 ring-inset ring-brand-500/30 sm:px-5">
              <span className="font-display text-sm font-bold text-brand-300 sm:text-base">
                {c.us}
              </span>
            </div>
            <div className="px-3 py-5 text-center text-sm font-medium text-white/45 sm:px-5">
              {c.others}
            </div>
          </div>

          {/* Rows */}
          {c.rows.map((row) => (
            <div
              key={row.label}
              className={
                'grid grid-cols-[1.4fr_1fr_1fr] border-t border-white/[0.05] ' +
                (row.highlight ? 'bg-brand-500/[0.05]' : '')
              }
            >
              <div className="flex items-center px-4 py-4 text-sm text-white/70 sm:px-6">
                {row.label}
              </div>
              <div className="flex items-center justify-center gap-1.5 bg-brand-500/[0.06] px-3 py-4 text-center text-sm font-semibold text-white ring-1 ring-inset ring-brand-500/15 sm:px-5">
                <Check />
                <span>{row.us}</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 px-3 py-4 text-center text-sm text-white/45 sm:px-5">
                {row.othersBad && <Cross />}
                <span>{row.others}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2FBE87"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Cross() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9AA0A6"
      strokeWidth="2.6"
      strokeLinecap="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
