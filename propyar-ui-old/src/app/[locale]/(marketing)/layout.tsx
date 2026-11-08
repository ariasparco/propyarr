import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';

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
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        locale={loc}
        nav={dict.nav}
        planTypes={dict.plansPage.typeLabels}
        brandName={dict.brand}
        isAuthed={!!session}
      />
      <main className="flex-1">{children}</main>
      <Footer locale={loc} dict={dict} />
    </div>
  );
}
