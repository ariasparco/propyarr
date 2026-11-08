import Link from 'next/link';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';

export function PayoutSection({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary;
}) {
  const p = dict.payout;
  return (
    <section className="section">
      <div className="container-x">
        <div className="card relative overflow-hidden p-8 sm:p-12">
          <div
            aria-hidden
            className="absolute -end-20 -top-20 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl"
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">{dict.dashboard.nav.payouts}</p>
              <h2 className="mt-3 h-section">{p.title}</h2>
              <p className="mt-4 max-w-lg text-white/60">{p.subtitle}</p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-sm text-white/80">
                    <Check />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href={path(locale, '/plans')}
                className="btn-primary mt-8"
              >
                {dict.common.getFunded}
              </Link>
            </div>

            {/* Payout receipt mock */}
            <div className="relative mx-auto w-full max-w-sm">
              <div className="card border-brand-500/20 p-6 shadow-glow">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                    <Check big />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {dict.dashboard.payouts.title}
                    </p>
                    <p className="text-xs text-white/40">
                      {dict.admin.actions.markPaid}
                    </p>
                  </div>
                  <span className="badge ms-auto">24h</span>
                </div>
                <div className="my-6 text-center">
                  <p className="font-mono text-4xl font-bold text-white">
                    $6,420
                  </p>
                  <p className="mt-1 text-xs text-white/40">USDT · TRC20</p>
                </div>
                <div className="space-y-2 border-t border-white/[0.06] pt-4 text-xs">
                  <Row k={dict.dashboard.account.profit} v="$8,025" />
                  <Row k={dict.plansPage.feature.split} v="80%" />
                  <Row k={dict.dashboard.payouts.method} v="Crypto" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40">{k}</span>
      <span className="font-mono font-medium text-white/90">{v}</span>
    </div>
  );
}

function Check({ big }: { big?: boolean }) {
  const s = big ? 18 : 15;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={big ? '' : 'text-brand-400'}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
