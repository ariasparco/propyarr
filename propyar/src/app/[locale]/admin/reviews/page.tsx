import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getAllReviews } from '@/lib/admin';
import { formatDate } from '@/lib/format';
import { ReviewActions } from '@/components/admin/ReviewActions';
import { Avatar } from '@/components/marketing/Avatar';

export default async function AdminReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const r = getDictionary(loc).reviews;
  const reviews = await getAllReviews();

  const pill: Record<string, { label: string; cls: string }> = {
    PENDING: { label: r.pending, cls: 'bg-amber-500/15 text-amber-500' },
    APPROVED: { label: r.approved, cls: 'bg-brand-500/15 text-brand-300' },
    REJECTED: { label: r.rejected, cls: 'bg-red-500/15 text-red-500' },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h2 className="text-xl font-semibold text-white">{r.adminTitle}</h2>
      {reviews.length === 0 ? (
        <p className="card p-10 text-center text-white/50">{r.empty}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reviews.map((v) => {
            const p = pill[v.status] ?? pill.PENDING;
            return (
              <div key={v.id} className="card space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <Avatar gender={v.gender} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{v.name}</p>
                    <p className="text-xs text-gold-500">{'★'.repeat(v.rating)}<span className="text-white/20">{'★'.repeat(5 - v.rating)}</span></p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.cls}`}>{p.label}</span>
                </div>
                <p className="text-sm leading-relaxed text-white/75">{v.text}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/40">{formatDate(v.createdAt, loc)}</span>
                  <ReviewActions
                    reviewId={v.id}
                    status={v.status}
                    labels={{ approve: r.approve, reject: r.reject, remove: r.remove }}
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
