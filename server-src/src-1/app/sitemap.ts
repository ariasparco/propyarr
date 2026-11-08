import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/constants';
import { locales, defaultLocale } from '@/i18n/config';

// Public, indexable marketing routes (no auth-gated areas)
const ROUTES = ['', '/plans', '/rules', '/faq', '/about', '/contact'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return ROUTES.flatMap((route) =>
    locales.map((locale) => {
      const priority = route === '' ? 1 : route === '/plans' ? 0.9 : 0.7;
      return {
        url: `${SITE.url}/${locale}${route}`,
        lastModified: now,
        changeFrequency: route === '' ? ('daily' as const) : ('weekly' as const),
        priority,
        alternates: {
          languages: {
            ...Object.fromEntries(
              locales.map((l) => [l, `${SITE.url}/${l}${route}`]),
            ),
            'x-default': `${SITE.url}/${defaultLocale}${route}`,
          },
        },
      };
    }),
  );
}
