import type { Dictionary } from '@/i18n';
import { CardIcon, TrophyIcon, UserPlusIcon } from '@/components/site/Icons';
import { SectionTitle } from './SectionTitle';

const ICONS = [UserPlusIcon, CardIcon, TrophyIcon];

export function AccountSteps({ dict }: { dict: Dictionary }) {
  const v = dict.home.v2;
  return (
    <section className="container-x mt-14">
      <SectionTitle>{v.stepsTitle}</SectionTitle>
      <ol className="mt-8 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {v.steps.map((step, i) => {
          const Icon = ICONS[i];
          return (
            <li key={step.title} className="contents">
              <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-paper p-5 shadow-card">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
                  <Icon size={30} />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-extrabold text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs text-paper">
                      {i + 1}
                    </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{step.desc}</p>
                </div>
              </div>
              {i < v.steps.length - 1 && (
                <span aria-hidden className="hidden text-2xl font-black text-brand-500 md:block">
                  «
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
