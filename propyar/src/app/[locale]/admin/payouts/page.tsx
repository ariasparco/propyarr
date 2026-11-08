import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getAllPayouts } from '@/lib/admin';
import { formatCurrency, formatDate } from '@/lib/format';
import { AdminTable } from '@/components/admin/AdminTable';
import { StatusBadge } from '@/components/dashboard/Widgets';
import { PayoutActions } from '@/components/admin/PayoutActions';
import { txUrl, shortHash } from '@/lib/explorer';

export default async function AdminPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const payouts = await getAllPayouts();
  const t = dict.admin.table;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-semibold text-white">
        {dict.admin.nav.payouts}
      </h2>
      <AdminTable
        headers={[
          t.email,
          t.account,
          t.amount,
          t.method,
          t.wallet,
          t.status,
          t.actions,
        ]}
        empty={payouts.length === 0}
      >
        {payouts.map((p) => (
          <tr key={p.id} className="text-white/80">
            <td className="px-4 py-3 text-white/70">{p.email}</td>
            <td className="px-4 py-3 font-mono text-white/90">
              #{p.accountNumber}
            </td>
            <td className="px-4 py-3 font-mono font-semibold text-brand-300">
              {formatCurrency(p.amount, loc)}
              {p.splitPercent != null && (
                <span className="block text-[11px] font-normal text-white/45">
                  {loc === 'fa' ? 'سهم' : 'split'} {p.splitPercent}%
                </span>
              )}
              {p.refundAmount > 0 && (
                <span className="block text-[11px] font-normal text-gold-500">
                  + {loc === 'fa' ? 'ریفاند' : 'refund'} {formatCurrency(p.refundAmount, loc)}
                </span>
              )}
            </td>
            <td className="px-4 py-3 text-white/70">{p.method}</td>
            <td
              className="max-w-[160px] truncate px-4 py-3 font-mono text-xs text-white/50"
              title={p.wallet}
            >
              {p.wallet}
              {p.txHash && (
                <a
                  href={txUrl(p.txHash, p.network) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-brand-300 underline"
                >
                  {shortHash(p.txHash)}
                </a>
              )}
            </td>
            <td className="px-4 py-3">
              <StatusBadge
                status={p.status}
                label={
                  dict.status[p.status as keyof typeof dict.status] ?? p.status
                }
              />
            </td>
            <td className="px-4 py-3">
              <PayoutActions
                payoutId={p.id}
                status={p.status}
                labels={{
                  approve: dict.admin.actions.approve,
                  reject: dict.admin.actions.reject,
                  markPaid: dict.admin.actions.markPaid,
                  txHash: loc === 'fa' ? 'هش تراکنش (TxID)' : 'Transaction hash (TxID)',
                }}
              />
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
