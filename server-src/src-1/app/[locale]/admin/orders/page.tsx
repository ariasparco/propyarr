import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getAllOrders } from '@/lib/admin';
import { formatCurrency } from '@/lib/format';
import { AdminTable } from '@/components/admin/AdminTable';
import { StatusBadge } from '@/components/dashboard/Widgets';
import { OrderActions } from '@/components/admin/OrderActions';

export default async function AdminOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const orders = await getAllOrders();
  const t = dict.admin.table;
  const o = dict.admin.orders;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-semibold text-white">
        {dict.admin.nav.orders}
      </h2>
      <AdminTable
        headers={[t.plan, t.amount, t.status, o.buyer, t.actions]}
        empty={orders.length === 0}
      >
        {orders.map((row) => (
          <tr key={row.id} className="align-top text-white/80">
            <td className="px-4 py-3 text-white/90">
              {row.plan}
              {row.kind !== 'PURCHASE' && (
                <span className="ms-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-[0.7rem] text-sky-300">
                  {o.kinds[row.kind as keyof typeof o.kinds] ?? row.kind}
                </span>
              )}
            </td>
            <td className="px-4 py-3 font-mono text-white">
              {row.kind === 'PURCHASE' ? (
                <>
                  {formatCurrency(row.amount, loc)}
                  <span className="ms-1 text-xs uppercase text-white/40">
                    {row.method}
                  </span>
                </>
              ) : (
                <span className="text-xs text-white/40">{o.free}</span>
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <StatusBadge
                  status={row.status}
                  label={
                    dict.status[row.status as keyof typeof dict.status] ??
                    row.status
                  }
                />
                {row.fulfillment !== 'NONE' && (
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-center text-xs font-medium ' +
                      (row.fulfillment === 'COMPLETED'
                        ? 'bg-brand-500/15 text-brand-300'
                        : 'bg-amber-500/15 text-amber-300')
                    }
                  >
                    {o.fulfillment[
                      row.fulfillment as keyof typeof o.fulfillment
                    ] ?? row.fulfillment}
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-3 text-white/60">{row.name}</td>
            <td className="px-4 py-3">
              <OrderActions
                order={{
                  id: row.id,
                  name: row.name,
                  email: row.email,
                  phone: row.phone,
                  country: row.country,
                  kyc: row.kyc,
                  fulfillment: row.fulfillment,
                  kind: row.kind,
                  sourceAccount: row.sourceAccount,
                  accountNumber: row.accountNumber,
                }}
                labels={{
                  viewInfo: dict.admin.actions.viewInfo,
                  complete: dict.admin.actions.complete,
                  buyer: o.buyer,
                  phone: o.phone,
                  country: o.country,
                  kyc: o.kyc,
                  stage: o.stage,
                  fromAccount: o.fromAccount,
                  formTitle: o.formTitle,
                  login: o.login,
                  password: o.password,
                  server: o.server,
                  investorPassword: o.investorPassword,
                  investorHint: o.investorHint,
                  metaApiId: o.metaApiId,
                  metaApiHint: o.metaApiHint,
                  submit: o.submit,
                  cancel: o.cancel,
                  kinds: o.kinds,
                }}
              />
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
