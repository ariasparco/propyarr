import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges } from '@/lib/data';
import { breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';
import { PlanTabs } from '@/components/marketing/PlanTabs';
import { CtaBand } from '@/components/marketing/CtaBand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.plans.title,
    description: dict.meta.plans.description,
    alternates: { canonical: `/${locale}/plans` },
  };
}

export default async function PlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { locale } = await params;
  const { type } = await searchParams;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const plans = await getActiveChallenges();

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: dict.nav.home, url: `/${loc}` },
          { name: dict.nav.plans, url: `/${loc}/plans` },
        ])}
      />
      <PageHeader
        eyebrow={dict.nav.plans}
        title={dict.plansPage.title}
        subtitle={dict.plansPage.subtitle}
      />

      <div className="pb-6 pt-4">
        <div className="container-x">
          <PlanTabs
            key={type ?? 'ONE_STEP'}
            plans={plans}
            locale={loc}
            dict={dict}
            initialType={type}
            showDetails
          />
        </div>
      </div>

      <CtaBand locale={loc} dict={dict} />
    </>
  );
}
