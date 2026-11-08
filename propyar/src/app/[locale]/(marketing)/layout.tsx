import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { getBannerDiscounts } from '@/lib/data';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { DiscountStrip } from '@/components/site/DiscountStrip';

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const [session, discounts] = await Promise.all([
    getSession(),
    getBannerDiscounts(),
  ]);
  const v2 = dict.home.v2;

  return (
    <div className="flex min-h-screen flex-col">
      <DiscountStrip
        codes={discounts}
        locale={loc}
        t={{
          discountTitle: v2.discountTitle,
          copy: v2.copy,
          copied: v2.copied,
          off: v2.off,
        }}
      />
      <Header
        locale={loc}
        nav={dict.nav}
        planTypes={dict.plansPage.typeLabels}
        dashboardLabel={v2.dashboard}
        brandName={dict.brand}
        isAuthed={!!session}
      />
      <main className="flex-1">{children}</main>
      <Footer locale={loc} dict={dict} />
    </div>
  );
}
