import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getAllAccounts } from '@/lib/admin';
import { formatCurrency } from '@/lib/format';
import { AdminTable } from '@/components/admin/AdminTable';
import { StatusBadge } from '@/components/dashboard/Widgets';
import { AccountActions } from '@/components/admin/AccountActions';
import { AccountMonitor } from '@/components/dashboard/AccountMonitor';
import { SyncBadge } from '@/components/admin/SyncBadge';
import { SyncAllButton } from '@/components/admin/SyncAllButton';
import { CertificateManager } from '@/components/admin/CertificateManager';

export default async function AdminAccountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const accounts = await getAllAccounts();
  const t = dict.admin.table;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">
          {dict.admin.nav.accounts}
        </h2>
        <SyncAllButton
          label={dict.admin.actions.syncAll ?? 'همگام‌سازی کلیه حساب‌ها'}
          successMsg={dict.monitor.syncAllSuccess ?? 'درخواست همگام‌سازی کلیه حساب‌ها ارسال شد.'}
        />
      </div>
      <AdminTable
        headers={[t.account, t.email, t.plan, t.amount, t.status, t.actions]}
        empty={accounts.length === 0}
      >
        {accounts.map((a) => (
          <tr key={a.id} className="text-white/80">
            <td className="px-4 py-3">
              <div className="font-mono font-semibold text-white">
                #{a.accountNumber}
              </div>
              <SyncBadge
                lastSyncedAt={a.lastSyncedAt}
                locale={loc}
                labels={dict.monitor.sync}
              />
            </td>
            <td className="px-4 py-3 text-white/60">{a.email}</td>
            <td className="px-4 py-3 text-white/80">{a.plan}</td>
            <td className="px-4 py-3 font-mono">
              {formatCurrency(a.equity, loc)}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-col items-start gap-1">
                <StatusBadge
                  status={a.status}
                  label={
                    dict.status[a.status as keyof typeof dict.status] ?? a.status
                  }
                />
                {a.breachRule && (
                  <span className="text-[0.7rem] text-red-300/80">
                    {dict.monitor.rules[
                      a.breachRule as keyof typeof dict.monitor.rules
                    ]?.name ?? a.breachRule}
                    {a.breachSource === 'ADMIN' && ` · ${dict.monitor.byAdmin}`}
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                <AccountMonitor
                  accountId={a.id}
                  locale={loc}
                  t={dict.monitor}
                  variant="modal"
                />
                <AccountActions
                  accountId={a.id}
                  status={a.status}
                  labels={{
                    advance: dict.admin.actions.advance,
                    fund: dict.admin.actions.fund,
                    disable: dict.admin.actions.disable,
                    fail: dict.admin.actions.fail,
                    sync: dict.admin.actions.sync,
                  }}
                />
              </div>
              <div className="mt-2">
                <CertificateManager
                  accountId={a.id}
                  phase={a.phase}
                  certificates={a.certificates}
                  t={dict.certificate}
                />
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
