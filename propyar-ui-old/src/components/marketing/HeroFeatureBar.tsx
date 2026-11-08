import type { Dictionary } from '@/i18n';
import { BarsIcon, BoltIcon, HeadsetIcon, ShieldIcon } from '@/components/site/Icons';

const ICONS = [HeadsetIcon, BarsIcon, BoltIcon, ShieldIcon];

export function HeroFeatureBar({ dict }: { dict: Dictionary }) {
  return (
    <section className="container-x">
      <div className="panel grid grid-cols-2 lg:grid-cols-4">
        {dict.home.features.map((f, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div
              key={f.title}
              className={
                'flex flex-col items-center gap-1.5 px-4 py-5 text-center ' +
                (i > 0 ? 'lg:border-s lg:border-brand-400/15 ' : '') +
                (i % 2 === 1 ? 'border-s border-brand-400/15 lg:border-s ' : '') +
                (i > 1 ? 'border-t border-brand-400/15 lg:border-t-0' : '')
              }
            >
              <Icon
                size={28}
                className="text-brand-400 drop-shadow-[0_0_8px_rgba(46,235,158,0.7)]"
              />
              <p className="mt-1 text-[15px] font-semibold leading-snug text-white">
                {f.title}
              </p>
              <p className="text-[15px] font-semibold leading-snug text-white">
                {f.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
