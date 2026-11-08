import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';
import { CtaBand } from '@/components/marketing/CtaBand';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import { SectionTitle } from '@/components/marketing/SectionTitle';
import {
  BoltIcon,
  CalendarIcon,
  GoldIcon,
  HedgeIcon,
  NoteIcon,
  ShieldAlertIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/site/Icons';

const RULE_ICONS = {
  calendar: CalendarIcon,
  hedge: HedgeIcon,
  users: UsersIcon,
  bolt: BoltIcon,
  shield: ShieldIcon,
  gold: GoldIcon,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.rules.title,
    description: dict.meta.rules.description,
    alternates: { canonical: `/${locale}/rules` },
  };
}

export default async function RulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const r = dict.rulesPage;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: dict.nav.home, url: `/${loc}` },
          { name: dict.nav.rules, url: `/${loc}/rules` },
        ])}
      />
      <PageHeader eyebrow={dict.nav.rules} title={r.title} subtitle={r.subtitle} />

      <div className="section">
        <div className="container-x">
          {/* Objectives table */}
          <div className="mx-auto max-w-4xl">
            <h2 className="text-xl font-semibold text-white">
              {r.objectives.title}
            </h2>
            <div className="mt-5 overflow-x-auto rounded-3xl border border-line bg-ink-850/40 shadow-card">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-line">
                    {r.objectives.cols.map((c, i) => (
                      <th
                        key={c}
                        className={
                          'px-5 py-4 font-semibold text-white/70 ' +
                          (i === 0 ? 'text-start' : 'text-center')
                        }
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {r.objectives.rows.map((row) => (
                    <tr
                      key={row[0]}
                      className="transition-colors hover:bg-white/[0.02]"
                    >
                      {row.map((cell, i) => (
                        <td
                          key={i}
                          className={
                            i === 0
                              ? 'px-5 py-3.5 text-start font-medium text-white/85'
                              : 'px-5 py-3.5 text-center font-mono font-semibold text-brand-300'
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* General rules */}
          <div className="mt-20">
            <SectionTitle>{r.generalTitle}</SectionTitle>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {r.general.map((g) => {
                const Icon =
                  RULE_ICONS[g.icon as keyof typeof RULE_ICONS] ?? ShieldIcon;
                return (
                  <div key={g.title} className="panel p-6">
                    <div className="flex items-center gap-3">
                      <IconBox>
                        <Icon size={20} />
                      </IconBox>
                      <h3 className="text-lg font-bold text-white">{g.title}</h3>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-white/70">
                      {g.body}
                    </p>
                  </div>
                );
              })}

              {/* Notice */}
              <div className="panel p-6 md:col-span-2 lg:col-span-3">
                <div className="flex items-start gap-3">
                  <IconBox>
                    <NoteIcon size={20} />
                  </IconBox>
                  <div>
                    <h3 className="text-lg font-bold text-white">{r.notice.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                      {r.notice.body}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* High-risk strategy policy — kept apart and highlighted */}
            <div className="mt-8 rounded-2xl border border-brand-300/60 bg-gradient-to-br from-brand-700 via-brand-800 to-teal-800 p-6 shadow-[0_0_44px_-14px_rgba(46,235,158,0.8)] sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-950/30 text-brand-100 ring-1 ring-brand-200/40">
                  <ShieldAlertIcon size={22} />
                </span>
                <div>
                  <h3 className="text-xl font-extrabold text-white">{r.highRisk.title}</h3>
                  <p className="mt-2 leading-relaxed text-white/90">{r.highRisk.body}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Rules FAQ */}
          <div className="mt-20">
            <h2 className="mx-auto max-w-2xl text-center font-display text-3xl font-extrabold text-white sm:text-4xl">
              {r.faqTitle}
            </h2>
            <div className="mt-10">
              <FaqAccordion items={r.faq} />
            </div>
          </div>
        </div>
      </div>

      <CtaBand locale={loc} dict={dict} />
    </>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-400/15 text-brand-300 ring-1 ring-brand-400/30 shadow-[0_0_14px_-4px_rgba(46,235,158,0.6)]">
      {children}
    </span>
  );
}
