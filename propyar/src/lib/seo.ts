import { SITE } from './constants';
import type { Locale } from '@/i18n/config';

// JSON-LD structured-data builders for rich search results.

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    email: SITE.email,
    logo: `${SITE.url}/icon.svg`,
    foundingDate: String(SITE.foundedYear),
    sameAs: [
      `https://twitter.com/${SITE.twitter.replace('@', '')}`,
      `https://t.me/${SITE.telegram}`,
    ],
  };
}

export function websiteSchema(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: `${SITE.url}/${locale}`,
    inLanguage: locale === 'fa' ? 'fa-IR' : 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE.url}/${locale}/plans`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqSchema(items: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

export function breadcrumbSchema(
  items: Array<{ name: string; url: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE.url}${it.url}`,
    })),
  };
}

export function productSchema(plan: {
  name: string;
  price: number;
  slug: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${SITE.name} — ${plan.name}`,
    brand: { '@type': 'Brand', name: SITE.name },
    offers: {
      '@type': 'Offer',
      price: plan.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
}
