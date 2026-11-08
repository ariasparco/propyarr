import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getPublicPayouts } from '@/lib/data';
import { path } from '@/lib/routes';
import { PageHeader } from '@/components/site/PageHeader';
import { PayoutsBoard } from '@/components/marketing/PayoutsBoard';

const PAGE_SIZE = 20;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const v = getDictionary(isLocale(locale) ? locale : 'fa').home.v2;
  return {
    title: v.payoutsTitle,
    description: v.payoutsSub,
    alternates: { canonical: `/${locale}/payouts` },
  };
}

// Every published payout, newest first, with its transaction link.
export default async function PayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const v = getDictionary(loc).home.v2;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { items, total } = await getPublicPayouts(page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `${path(loc, '/payouts')}?page=${p}`;

  return (
    <>
      <PageHeader title={v.payoutsTitle} subtitle={v.payoutsSub} />
      <div className="container-x py-10">
        <PayoutsBoard
          items={items}
          locale={loc}
          perPage={PAGE_SIZE}
          t={{
            payoutsTitle: v.payoutsTitle,
            payoutsSub: v.payoutsSub,
            payoutsEmpty: v.payoutsEmpty,
            track: v.track,
            allPayouts: v.allPayouts,
            cols: v.cols,
            prev: v.prev,
            next: v.next,
          }}
        />
        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-2 text-sm">
            {page > 1 && <Link href={href(page - 1)} className="btn-ghost py-1.5">{v.prev}</Link>}
            <span className="px-3 text-white/60">
              {v.page} {page.toLocaleString(loc === 'fa' ? 'fa-IR' : 'en-US')} / {pages.toLocaleString(loc === 'fa' ? 'fa-IR' : 'en-US')}
            </span>
            {page < pages && <Link href={href(page + 1)} className="btn-ghost py-1.5">{v.next}</Link>}
          </nav>
        )}
      </div>
    </>
  );
}
