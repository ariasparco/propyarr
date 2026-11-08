import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';
import { Stats } from '@/components/marketing/Stats';
import { CtaBand } from '@/components/marketing/CtaBand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.about.title,
    description: dict.meta.about.description,
    alternates: { canonical: `/${locale}/about` },
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const a = dict.aboutPage;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: dict.nav.home, url: `/${loc}` },
          { name: dict.nav.about, url: `/${loc}/about` },
        ])}
      />
      <PageHeader eyebrow={dict.nav.about} title={a.title} subtitle={a.subtitle} />

      <div className="section">
        <div className="container-x grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            {a.body.map((p, i) => (
              <p key={i} className="text-lg leading-relaxed text-white/65">
                {p}
              </p>
            ))}
          </div>
          <div className="space-y-4">
            {a.values.map((v) => (
              <div key={v.title} className="card p-6">
                <h3 className="text-lg font-semibold text-gradient">
                  {v.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Stats dict={dict} locale={loc} />
      <CtaBand locale={loc} dict={dict} />
    </>
  );
}
