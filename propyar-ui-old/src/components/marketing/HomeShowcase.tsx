import Image from 'next/image';
import type { Dictionary } from '@/i18n';
import { SITE } from '@/lib/constants';
import { LayersIcon, LinkIcon, TetherIcon, ChatIcon } from '@/components/site/Icons';
import { ReviewSlider } from './ReviewSlider';

type Payout = { id: string; name: string; amount: number };

// Homepage row under the plans: latest payouts, chart art, trader reviews.
export function HomeShowcase({
  dict,
  payouts,
}: {
  dict: Dictionary;
  payouts: Payout[];
}) {
  const h = dict.home;
  return (
    <section className="container-x mt-10">
      <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_200px_1fr]">
        {/* Reviews (right in RTL) */}
        <div className="panel flex flex-col p-4 sm:p-5">
          <h3 className="flex items-center gap-2.5 text-xl font-bold text-white">
            <ChatIcon size={26} className="text-brand-400" />
            {h.reviewsTitle}
          </h3>
          <ReviewSlider
            reviews={h.reviews}
            prevLabel={h.prev}
            nextLabel={h.next}
          />
        </div>

        {/* Chart art */}
        <div className="relative hidden items-center justify-center lg:flex">
          <Image
            src="/images/home/chart.jpg"
            alt=""
            width={380}
            height={372}
            className="h-auto w-full"
            style={{
              maskImage: 'radial-gradient(closest-side, #000 70%, transparent)',
              WebkitMaskImage: 'radial-gradient(closest-side, #000 70%, transparent)',
            }}
          />
        </div>

        {/* Latest payouts (left in RTL) */}
        <div className="panel flex flex-col p-4 sm:p-5">
          <h3 className="flex items-center gap-2.5 text-xl font-bold text-white">
            <LayersIcon size={26} className="text-brand-400" />
            {h.payoutsTitle}
          </h3>
          {payouts.length === 0 ? (
            <p className="mt-6 text-sm text-white/50">{h.payoutsEmpty}</p>
          ) : (
            <ul className="mt-4 divide-y divide-brand-400/10 rounded-xl border border-brand-400/15 bg-ink-900/50">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                    <TetherIcon size={22} />
                    USDT
                  </span>
                  <span dir="ltr" className="flex-1 text-center text-sm text-white/85">
                    {p.name}
                  </span>
                  <span dir="ltr" className="font-sans text-lg font-bold text-white">
                    ${p.amount.toLocaleString('en-US')}
                  </span>
                  <a
                    href={`https://t.me/${SITE.telegram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-brand-400/30 bg-brand-400/10 px-2.5 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-400/20"
                  >
                    <LinkIcon size={13} />
                    {h.view}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
