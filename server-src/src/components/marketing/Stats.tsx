import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { Counter } from './Counter';

export function Stats({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  return (
    <section className="border-y border-white/[0.06] bg-ink-850/40">
      <div className="container-x grid grid-cols-2 gap-px overflow-hidden md:grid-cols-4">
        {dict.stats.map((s) => (
          <div
            key={s.label}
            className="px-4 py-8 text-center transition-colors duration-300 hover:bg-white/[0.02]"
          >
            <p className="font-display text-3xl font-bold text-gradient sm:text-4xl">
              <Counter
                to={s.to}
                prefix={s.prefix}
                suffix={s.suffix}
                locale={locale}
              />
            </p>
            <p className="mt-2 text-sm text-white/50">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
