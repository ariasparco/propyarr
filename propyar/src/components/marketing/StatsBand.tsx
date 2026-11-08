import type { Dictionary } from '@/i18n';
import { CalendarIcon, HeadsetIcon, LayersIcon, UsersIcon } from '@/components/site/Icons';

const ICONS = [CalendarIcon, LayersIcon, UsersIcon, HeadsetIcon];

// Dark-green band of headline figures that closes the homepage.
export function StatsBand({ dict }: { dict: Dictionary }) {
  return (
    <section className="container-x my-14">
      <div className="grid grid-cols-2 gap-y-6 rounded-3xl bg-gradient-to-l from-[#03261B] via-[#0B4A31] to-[#03261B] px-4 py-7 text-paper shadow-glow-teal lg:grid-cols-4">
        {dict.home.v2.stats.map((s, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div
              key={s.label}
              className={
                'flex items-center justify-center gap-4 ' +
                (i > 0 ? 'lg:border-s lg:border-paper/15' : '')
              }
            >
              <Icon size={38} className="text-[#2EEB9E]" />
              <div>
                <p dir="ltr" className="text-end font-sans text-2xl font-black sm:text-3xl rtl:text-start">
                  {s.value}
                </p>
                <p className="text-sm text-paper/75">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
