import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { SITE } from '@/lib/constants';
import { PageHeader } from '@/components/site/PageHeader';
import { ContactForm } from '@/components/site/ContactForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.contact.title,
    description: dict.meta.contact.description,
    alternates: { canonical: `/${locale}/contact` },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const c = dict.contactPage;

  const channels = [
    { label: c.channels.email, value: SITE.email, href: `mailto:${SITE.email}` },
    {
      label: c.channels.telegram,
      value: `@${SITE.telegram}`,
      href: `https://t.me/${SITE.telegram}`,
    },
    { label: c.channels.hours, value: c.channels.hoursValue },
  ];

  return (
    <>
      <PageHeader eyebrow={dict.nav.contact} title={c.title} subtitle={c.subtitle} />

      <div className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            {channels.map((ch) => (
              <div key={ch.label} className="card p-6">
                <p className="text-sm text-white/40">{ch.label}</p>
                {ch.href ? (
                  <a
                    href={ch.href}
                    target={ch.href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className="mt-1 block text-lg font-medium text-white transition-colors hover:text-brand-300"
                  >
                    {ch.value}
                  </a>
                ) : (
                  <p className="mt-1 text-lg font-medium text-white">
                    {ch.value}
                  </p>
                )}
              </div>
            ))}
          </div>

          <ContactForm dict={c.form} />
        </div>
      </div>
    </>
  );
}
