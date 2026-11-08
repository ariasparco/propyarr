import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getReferralSummary } from '@/lib/wallet';
import { formatCurrency, formatDate } from '@/lib/format';
import { CopyField } from '@/components/dashboard/CopyField';
import { SITE } from '@/lib/constants';

export default async function ReferralsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const summary = await getReferralSummary(session.sub);
  const r = dict.referrals;
  const link = `${SITE.url}/${loc}/register?ref=${summary.code}`;

  const stats = [
    { label: r.invited, value: String(summary.invitedCount) },
    { label: r.earned, value: formatCurrency(summary.totalEarned, loc) },
    { label: r.rate, value: `${summary.percent}%` },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">{r.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-white/50">
          {r.subtitle.replace('{percent}', String(summary.percent))}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-xs text-white/40">{s.label}</p>
            <p className="mt-1.5 font-display text-2xl font-bold text-white">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="card space-y-4 p-6">
        <CopyField label={r.yourCode} value={summary.code} copy={r.copy} big />
        <CopyField label={r.yourLink} value={link} copy={r.copy} />
        <p className="rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-4 py-3 text-xs leading-relaxed text-brand-200">
          {r.howItWorks.replace('{percent}', String(summary.percent))}
        </p>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white">{r.yourInvites}</h3>
        {summary.invited.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">{r.noInvites}</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.05]">
            {summary.invited.map((u, i) => (
              <li
                key={`${u.name}-${i}`}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span className="text-white/85">{u.name}</span>
                <span className="text-xs text-white/40">
                  {formatDate(u.joinedAt, loc)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
