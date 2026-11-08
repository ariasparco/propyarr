import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { breadcrumbSchema } from '@/lib/seo';
import { SITE } from '@/lib/constants';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHeader } from '@/components/site/PageHeader';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.blog.title,
    description: dict.meta.blog.description,
    alternates: { canonical: `/${locale}/blog` },
  };
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const b = dict.blogPage;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: dict.nav.home, url: `/${loc}` },
          { name: dict.nav.blog, url: `/${loc}/blog` },
        ])}
      />
      <PageHeader eyebrow={b.eyebrow} title={b.title} subtitle={b.subtitle} />

      <section className="section">
        <div className="container-x">
          <div className="mx-auto max-w-xl rounded-4xl border border-teal-700/40 bg-teal-800/25 p-10 text-center shadow-card">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/25">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#DEB84F"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <h2 className="mt-6 text-2xl font-bold text-white">
              {b.comingSoonTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-md leading-relaxed text-white/55">
              {b.comingSoonText}
            </p>
            <a
              href={`https://t.me/${SITE.telegram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-8"
            >
              {b.cta}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
