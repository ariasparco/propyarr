import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getUserOrders } from '@/lib/data';
import { formatCurrency, formatDate } from '@/lib/format';
import { path } from '@/lib/routes';

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const orders = await getUserOrders(session.sub);
  const o = dict.dashboard.orders;

  /**
   * One badge describing where the order actually stands, rather than making
   * the trader combine a payment status and a fulfillment status themselves.
   */
  function stage(row: (typeof orders)[number]) {
    if (row.paymentStatus === 'FAILED')
      return { label: o.stages.cancelled, cls: 'bg-red-500/15 text-red-300' };
    if (row.paymentStatus === 'PENDING')
      return {
        label: o.stages.awaitingPayment,
        cls: 'bg-sky-500/15 text-sky-300',
      };
    if (row.fulfillment === 'COMPLETED')
      return {
        label: o.stages.completed,
        cls: 'bg-emerald-500/15 text-emerald-300',
      };
    return { label: o.stages.review, cls: 'bg-amber-500/15 text-amber-300' };
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{o.title}</h2>
          <p className="mt-1 text-sm text-white/50">{o.subtitle}</p>
        </div>
        <Link href={path(loc, '/dashboard/buy')} className="btn-primary">
          {dict.dashboard.nav.buy}
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-white/50">{o.empty}</p>
          <Link
            href={path(loc, '/dashboard/buy')}
            className="btn-primary mt-5 inline-flex"
          >
            {dict.dashboard.overview.startCta}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((row) => {
            const s = stage(row);
            return (
              <div key={row.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* A top-up has no plan: show what was actually bought —
                          the credit itself — instead of an account size. */}
                      <span className="font-display text-lg font-bold text-white">
                        {formatCurrency(
                          row.virtualCapital ?? row.amount,
                          loc,
                        )}
                      </span>
                      {row.plan && (
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[0.7rem] text-white/60">
                          {row.plan}
                        </span>
                      )}
                      {row.kind !== 'PURCHASE' && (
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[0.7rem] text-sky-300">
                          {dict.admin.orders.kinds[
                            row.kind as keyof typeof dict.admin.orders.kinds
                          ] ?? row.kind}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-white/40">
                      {formatDate(row.createdAt, loc)}
                      {row.kind === 'PURCHASE' && (
                        <>
                          {' · '}
                          {formatCurrency(row.amount, loc)}
                          <span className="ms-1 uppercase">{row.method}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}
                  >
                    {s.label}
                  </span>
                </div>

                {/* What happens next, spelled out per state. */}
                {row.paymentStatus === 'PAID' &&
                  row.fulfillment === 'REVIEW' && (
                    <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
                      <span className="me-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 align-middle" />
                      {o.reviewNote}
                    </p>
                  )}

                {row.paymentStatus === 'PENDING' && (
                  <p className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs leading-relaxed text-sky-200">
                    {o.pendingNote}
                  </p>
                )}

                {row.fulfillment === 'COMPLETED' && row.accountNumber && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                    <span className="text-xs text-white/60">
                      {o.accountReady}:{' '}
                      <span className="font-mono text-white">
                        #{row.accountNumber}
                      </span>
                    </span>
                    <Link
                      href={path(loc, '/dashboard/accounts')}
                      className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                    >
                      {o.viewAccount} ←
                    </Link>
                  </div>
                )}

                {row.txHash && (
                  <p className="mt-3 break-all font-mono text-[0.7rem] text-white/30">
                    {o.txHash}: {row.txHash}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
