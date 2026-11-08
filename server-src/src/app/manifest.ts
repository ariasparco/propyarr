import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/constants';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Prop Trading Firm`,
    short_name: SITE.name,
    description:
      'Get funded up to $400,000. Trade our capital, keep up to 90% of the profit.',
    start_url: '/fa',
    display: 'standalone',
    background_color: '#111315',
    theme_color: '#C9A227',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
