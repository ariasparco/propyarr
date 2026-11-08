import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Plus_Jakarta_Sans, Vazirmatn } from 'next/font/google';
import '../globals.css';
import { getDictionary } from '@/i18n';
import { locales, isLocale, localeDir } from '@/i18n/config';
import { SITE } from '@/lib/constants';
import { TelegramFab } from '@/components/site/TelegramFab';

// Latin brand font (per brand guide). Serves body + display.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});
// Persian fallback for IRANYekanX (loaded via @font-face in globals.css).
const vazir = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-fa',
  display: 'swap',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  const ogLocale = locale === 'fa' ? 'fa_IR' : 'en_US';
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: `${SITE.name} — ${dict.meta.home.title}`,
      template: `%s | ${SITE.name}`,
    },
    description: dict.meta.home.description,
    applicationName: SITE.name,
    authors: [{ name: SITE.name }],
    keywords:
      locale === 'fa'
        ? [
            'پراپ',
            'پراپ فرم',
            'پراپ تریدینگ',
            'فاند',
            'حساب فاند',
            'چالش معاملاتی',
            'فارکس',
            'تقسیم سود',
          ]
        : [
            'prop firm',
            'prop trading',
            'funded account',
            'trading challenge',
            'forex funding',
            'get funded',
            'profit split',
          ],
    alternates: {
      canonical: `/${locale}`,
      languages: {
        fa: '/fa',
        en: '/en',
        'x-default': '/fa',
      },
    },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      locale: ogLocale,
      url: `/${locale}`,
      title: `${SITE.name} — ${dict.meta.home.title}`,
      description: dict.meta.home.description,
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE.twitter,
      creator: SITE.twitter,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      dir={localeDir[locale]}
      className={`${jakarta.variable} ${vazir.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        {children}
        {/* Rendered once here rather than per page group, so it follows the
            visitor everywhere — marketing, dashboard and admin alike. */}
        <TelegramFab locale={locale} />
      </body>
    </html>
  );
}
