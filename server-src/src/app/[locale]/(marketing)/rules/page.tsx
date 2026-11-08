import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';
import { CtaBand } from '@/components/marketing/CtaBand';

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

          {/* Detailed rules */}
          <div className="mt-16 grid gap-5 md:grid-cols-2">
            {r.sections.map((s, i) => (
              <div key={i} className="card p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 font-mono text-sm font-bold text-brand-300 ring-1 ring-brand-500/20">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/60">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CtaBand locale={loc} dict={dict} />
    </>
  );
}
