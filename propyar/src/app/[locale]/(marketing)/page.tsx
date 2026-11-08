import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import {
  getActiveChallenges,
  getPublicPayouts,
  getApprovedReviews,
} from '@/lib/data';
import { path } from '@/lib/routes';
import { organizationSchema, websiteSchema, faqSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Hero } from '@/components/marketing/Hero';
import { HeroFeatureBar } from '@/components/marketing/HeroFeatureBar';
import { PlanTabs } from '@/components/marketing/PlanTabs';
import { SectionTitle } from '@/components/marketing/SectionTitle';
import { AccountSteps } from '@/components/marketing/AccountSteps';
import { AnalysisPromo } from '@/components/marketing/AnalysisPromo';
import { PayoutsBoard } from '@/components/marketing/PayoutsBoard';
import { ReviewsCarousel } from '@/components/marketing/ReviewsCarousel';
import { ReviewForm } from '@/components/marketing/ReviewForm';
import { HomeFaq } from '@/components/marketing/HomeFaq';
import { StatsBand } from '@/components/marketing/StatsBand';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const v = dict.home.v2;

  const [plans, payouts, reviews] = await Promise.all([
    getActiveChallenges(),
    getPublicPayouts(1, 20),
    getApprovedReviews(),
  ]);

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(loc),
          faqSchema(v.faq),
        ]}
      />

      <Hero locale={loc} dict={dict} />
      <HeroFeatureBar dict={dict} />

      <section className="container-x mt-12">
        <SectionTitle>{dict.home.plansTitle}</SectionTitle>
        <div className="mt-6">
          <PlanTabs plans={plans} locale={loc} dict={dict} />
        </div>
      </section>

      <AccountSteps dict={dict} />
      <AnalysisPromo locale={loc} dict={dict} />

      <section className="container-x mt-14">
        <PayoutsBoard
          items={payouts.items}
          locale={loc}
          allHref={path(loc, '/payouts')}
          t={{
            payoutsTitle: v.payoutsTitle,
            payoutsSub: v.payoutsSub,
            payoutsEmpty: v.payoutsEmpty,
            track: v.track,
            allPayouts: v.allPayouts,
            cols: v.cols,
            prev: v.prev,
            next: v.next,
          }}
        />
      </section>

      <section className="container-x mt-14">
        <SectionTitle>{dict.reviews.title}</SectionTitle>
        <div className="mt-8">
          {reviews.length > 0 ? (
            <ReviewsCarousel reviews={reviews} prevLabel={v.prev} nextLabel={v.next} />
          ) : (
            <p className="text-center text-sm text-white/50">{dict.reviews.empty}</p>
          )}
        </div>
      </section>

      <HomeFaq dict={dict} />
      <StatsBand dict={dict} />

      {/* Deliberately small: a quiet way in for anyone who wants to review. */}
      <div className="container-x -mt-8 mb-10 text-center">
        <ReviewForm t={dict.reviews} />
      </div>
    </>
  );
}
