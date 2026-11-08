import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getKycRequests } from '@/lib/admin';
import { formatDate } from '@/lib/format';
import { KycActions } from '@/components/admin/KycActions';

export default async function AdminKycPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const k = dict.kyc;
  const requests = await getKycRequests();

  const statusPill: Record<string, { label: string; cls: string }> = {
    PENDING: { label: k.statusPending, cls: 'bg-amber-500/15 text-amber-300' },
    APPROVED: { label: k.statusApproved, cls: 'bg-brand-500/15 text-brand-300' },
    REJECTED: { label: k.statusRejected, cls: 'bg-red-500/15 text-red-300' },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h2 className="text-xl font-semibold text-white">{k.requests}</h2>

      {requests.length === 0 ? (
        <p className="card p-10 text-center text-white/50">{k.noRequests}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((r) => {
            const p = statusPill[r.status] ?? statusPill.PENDING;
            return (
              <div key={r.id} className="card overflow-hidden p-0">
                <a href={r.imageUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.imageUrl}
                    alt="identity document"
                    className="h-44 w-full bg-black/40 object-contain"
                  />
                </a>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.cls}`}
                    >
                      {p.label}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-white/50">{r.email}</p>
                  <p className="font-mono text-xs text-white/50" dir="ltr">
                    {r.phone}
                  </p>
                  <p className="text-xs text-white/50">
                    {r.docType === 'melli' ? k.melli : k.shenasnameh} ·{' '}
                    {formatDate(r.createdAt, loc)}
                  </p>
                  <KycActions
                    kycId={r.id}
                    status={r.status}
                    labels={{ approve: k.approve, reject: k.reject }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
