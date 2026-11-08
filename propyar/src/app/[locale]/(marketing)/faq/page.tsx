import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { breadcrumbSchema, faqSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import { CtaBand } from '@/components/marketing/CtaBand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.faq.title,
    description: dict.meta.faq.description,
    alternates: { canonical: `/${locale}/faq` },
  };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);

  return (
    <>
      <JsonLd
        data={[
          faqSchema(dict.faqPage.items),
          breadcrumbSchema([
            { name: dict.nav.home, url: `/${loc}` },
            { name: dict.nav.faq, url: `/${loc}/faq` },
          ]),
        ]}
      />
      <PageHeader
        eyebrow={dict.nav.faq}
        title={dict.faqPage.title}
        subtitle={dict.faqPage.subtitle}
      />

      <div className="section">
        <div className="container-x">
          <FaqAccordion items={dict.faqPage.items} />
        </div>
      </div>

      <CtaBand locale={loc} dict={dict} />
    </>
  );
}
