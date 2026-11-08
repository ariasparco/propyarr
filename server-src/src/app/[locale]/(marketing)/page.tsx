import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getActiveChallenges } from '@/lib/data';
import { path } from '@/lib/routes';
import { organizationSchema, websiteSchema, faqSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Hero } from '@/components/marketing/Hero';
import { HeroFeatureBar } from '@/components/marketing/HeroFeatureBar';
import { Steps } from '@/components/marketing/Steps';
import { Features } from '@/components/marketing/Features';
import { Stats } from '@/components/marketing/Stats';
import { Comparison } from '@/components/marketing/Comparison';
import { PayoutSection } from '@/components/marketing/PayoutSection';
import { Testimonials } from '@/components/marketing/Testimonials';
import { CtaBand } from '@/components/marketing/CtaBand';
import { TelegramSection } from '@/components/marketing/TelegramSection';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import { PlanCard } from '@/components/marketing/PlanCard';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);

  const allPlans = await getActiveChallenges();
  const preview = pickThree(allPlans);
  const faqTeaser = dict.faqPage.items.slice(0, 6);

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
      <Steps dict={dict} />
      <Stats dict={dict} locale={loc} />
      <Features dict={dict} />
      <Comparison dict={dict} />

      {preview.length > 0 && (
        <section className="section">
          <div className="container-x">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-xl">
                <p className="eyebrow">{dict.plansPage.title}</p>
                <h2 className="mt-3 h-section">{dict.plansPage.subtitle}</h2>
              </div>
              <Link href={path(loc, '/plans')} className="btn-ghost">
                {dict.common.viewPlans}
              </Link>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {preview.map((plan) => (
                <PlanCard key={plan.id} plan={plan} locale={loc} dict={dict} />
              ))}
            </div>
          </div>
        </section>
      )}

      <TelegramSection locale={loc} dict={dict} />
      <PayoutSection locale={loc} dict={dict} />
      <Testimonials dict={dict} />

      <section className="section">
        <div className="container-x">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="eyebrow">{dict.faqPage.title}</p>
            <h2 className="mt-3 h-section">{dict.faqPage.subtitle}</h2>
          </div>
          <FaqAccordion items={faqTeaser} />
          <div className="mt-8 text-center">
            <Link href={path(loc, '/faq')} className="btn-ghost">
              {dict.common.learnMore}
            </Link>
          </div>
        </div>
      </section>

      <CtaBand locale={loc} dict={dict} />
    </>
  );
}

// Show a varied trio: prefer including the "popular" plan.
function pickThree<T extends { popular: boolean }>(plans: T[]): T[] {
  if (plans.length <= 3) return plans;
  const popular = plans.find((p) => p.popular);
  const rest = plans.filter((p) => p !== popular);
  const chosen = [rest[0], popular ?? rest[1], rest[rest.length - 1]].filter(
    Boolean,
  ) as T[];
  return chosen.slice(0, 3);
}
