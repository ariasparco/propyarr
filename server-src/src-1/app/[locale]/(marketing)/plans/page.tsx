import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges } from '@/lib/data';
import { CHALLENGE_TYPES } from '@/lib/constants';
import { breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';
import { PlanCard } from '@/components/marketing/PlanCard';
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

      <div className="section">
        <div className="container-x space-y-16">
          {CHALLENGE_TYPES.map((type) => {
            const group = plans.filter((p) => p.accountType === type);
            if (group.length === 0) return null;
            const label =
              dict.plansPage.typeLabels[
                type as keyof typeof dict.plansPage.typeLabels
              ];
            return (
              <div key={type}>
                <div className="mb-8 flex items-center gap-4">
                  <h2 className="font-display text-2xl font-bold text-white">
                    {label}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      locale={loc}
                      dict={dict}
                    />
                  ))}
                </div>
              </div>
            );
          })}

        </div>
      </div>

      <CtaBand locale={loc} dict={dict} />
    </>
  );
}
