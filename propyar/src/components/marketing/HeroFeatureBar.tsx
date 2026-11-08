import type { Dictionary } from '@/i18n';
import { BarsIcon, BoltIcon, HeadsetIcon, ShieldIcon } from '@/components/site/Icons';

const ICONS = [HeadsetIcon, BarsIcon, BoltIcon, ShieldIcon];

// White card overlapping the bottom edge of the hero.
export function HeroFeatureBar({ dict }: { dict: Dictionary }) {
  return (
    <section className="container-x relative z-10 -mt-14">
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-paper shadow-card lg:grid-cols-4">
        {dict.home.v2.features.map((f, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div
              key={f.title}
              className={
                'flex flex-col items-center gap-1 px-4 py-5 text-center ' +
                (i % 2 === 1 ? 'border-s border-white/[0.07] ' : '') +
                (i > 1 ? 'border-t border-white/[0.07] lg:border-t-0 ' : '') +
                (i === 2 ? 'lg:border-s' : '')
              }
            >
              <Icon size={30} className="text-brand-400" />
              <p className="mt-1.5 text-base font-extrabold text-white">{f.title}</p>
              <p className="text-sm text-white/60">{f.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
