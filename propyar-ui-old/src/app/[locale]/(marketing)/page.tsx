import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges, getLatestPayouts } from '@/lib/data';
import { organizationSchema, websiteSchema, faqSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Hero } from '@/components/marketing/Hero';
import { HeroFeatureBar } from '@/components/marketing/HeroFeatureBar';
import { PlanTabs } from '@/components/marketing/PlanTabs';
import { HomeShowcase } from '@/components/marketing/HomeShowcase';
import { CtaBand } from '@/components/marketing/CtaBand';
import { SectionTitle } from '@/components/marketing/SectionTitle';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);

  const [plans, payouts] = await Promise.all([
    getActiveChallenges(),
    getLatestPayouts(3),
  ]);

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(loc),
          faqSchema(dict.faqPage.items),
        ]}
      />

      <Hero locale={loc} dict={dict} />
      <HeroFeatureBar dict={dict} />

      <section className="container-x mt-8">
        <SectionTitle>{dict.home.plansTitle}</SectionTitle>
        <div className="mt-5">
          <PlanTabs plans={plans} locale={loc} dict={dict} />
        </div>
      </section>

      <HomeShowcase dict={dict} payouts={payouts} />
      <CtaBand locale={loc} dict={dict} />
    </>
  );
}
