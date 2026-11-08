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
import { AccountOwner } from '@/components/admin/AccountOwner';
import { AccountCredentials } from '@/components/admin/AccountCredentials';
import { AccountDelete } from '@/components/admin/AccountDelete';
import { BreachReason } from '@/components/admin/BreachReason';
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
              {/* The broker clock this account's trading day is measured
                  against, as its own terminal reported it. Shown because a
                  wrong day boundary is invisible until it fails somebody. */}
              {a.brokerUtcOffset !== null && (
                <span className="block text-[0.65rem] text-white/35">
                  {dict.admin.table.brokerClock}:{' '}
                  <span dir="ltr" className="font-mono text-white/55">
                    UTC{a.brokerUtcOffset >= 0 ? '+' : ''}
                    {a.brokerUtcOffset}
                  </span>
                </span>
              )}
              {/* Login details sit beside the number they belong to, so a
                  mistyped password is corrected where it is noticed. */}
              <AccountCredentials
                accountId={a.id}
                state={{
                  accountNumber: a.accountNumber,
                  server: a.server,
                  hasPassword: a.hasPassword,
                  hasInvestorPassword: a.hasInvestorPassword,
                }}
                t={dict.admin.credentials}
              />
            </td>
            <td className="px-4 py-3 text-[0.75rem]">
              <AccountOwner
                accountId={a.id}
                email={a.email}
                name={a.ownerName}
                isAdminOwned={a.adminOwned}
              />
            </td>
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
                {/* The figures the verdict was reached on. Support answering a
                    disputed account needs the numbers, not just the rule name. */}
                <BreachReason detail={a.breachDetail} locale={loc} />
                {/* A hand-written verdict has no figures, only this. Shown here
                    as well as to the trader so an admin picking the row up can
                    see what their colleague told the customer. */}
                {a.breachNote && (
                  <p className="max-w-[16rem] whitespace-pre-wrap text-[0.65rem] leading-relaxed text-amber-300/70">
                    “{a.breachNote}”
                  </p>
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
                    reason: dict.admin.actions.reason,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AccountDelete
                  accountId={a.id}
                  accountNumber={a.accountNumber}
                  t={dict.admin.deleteAccount}
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
