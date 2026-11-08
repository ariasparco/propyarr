import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getAllUsers } from '@/lib/admin';
import { formatCurrency, formatDate } from '@/lib/format';
import { AdminTable } from '@/components/admin/AdminTable';
import { StatusBadge } from '@/components/dashboard/Widgets';
import { WalletAdjust } from '@/components/admin/WalletAdjust';

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const users = await getAllUsers();
  const t = dict.admin.table;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-semibold text-white">{dict.admin.nav.users}</h2>
      <AdminTable
        headers={[
          t.user,
          t.email,
          t.role,
          dict.admin.nav.accounts,
          dict.dashboard.nav.wallet,
          t.actions,
        ]}
        empty={users.length === 0}
      >
        {users.map((u) => (
          <tr key={u.id} className="align-top text-white/80">
            <td className="px-4 py-3">
              <div className="font-medium text-white">{u.name}</div>
              <div className="mt-0.5 text-xs text-white/40">
                {formatDate(u.createdAt, loc)}
              </div>
            </td>
            <td className="px-4 py-3 text-white/60">{u.email}</td>
            <td className="px-4 py-3">
              <StatusBadge
                status={u.role === 'ADMIN' ? 'APPROVED' : 'ACTIVE'}
                label={
                  dict.status[u.role as keyof typeof dict.status] ?? u.role
                }
              />
            </td>
            <td className="px-4 py-3 font-mono">{u.accounts}</td>
            <td className="px-4 py-3 font-mono text-brand-300">
              {formatCurrency(u.walletBalance, loc)}
            </td>
            <td className="px-4 py-3">
              <WalletAdjust
                userId={u.id}
                balance={u.walletBalance}
                t={dict.admin.wallet}
              />
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
