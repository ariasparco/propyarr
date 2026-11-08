import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getBannerDiscounts } from '@/lib/data';
import { PercentIcon } from '@/components/site/Icons';

// Codes staff are currently advertising, for traders to copy at checkout.
export default async function DiscountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const t = getDictionary(loc).dash2.discounts;
  const codes = await getBannerDiscounts();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-black text-white">{t.title}</h2>
        <p className="mt-1 text-sm text-white/55">{t.hint}</p>
      </div>
      {codes.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.06] bg-paper p-10 text-center text-white/55 shadow-card">{t.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {codes.map((c) => (
            <div key={c.code} className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-brand-500/40 bg-paper p-5 shadow-card">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-400 text-[#3A2A00]">
                <PercentIcon size={28} />
              </span>
              <div className="min-w-0">
                <p dir="ltr" className="text-start font-mono text-2xl font-black tracking-widest text-white rtl:text-end">{c.code}</p>
                <p className="text-sm font-bold text-brand-400">
                  {c.percent.toLocaleString(loc === 'fa' ? 'fa-IR' : 'en-US')}٪
                  {c.label ? ` · ${c.label}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
