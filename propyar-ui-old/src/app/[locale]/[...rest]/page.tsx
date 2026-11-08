import { notFound } from 'next/navigation';

// Catch-all for unmatched paths under a locale (e.g. /fa/does-not-exist).
// Funnels them into the localized [locale]/not-found.tsx so 404s stay branded
// and RTL-aware — without needing a global app/not-found.tsx (which would require
// a root layout this app intentionally doesn't have).
export default function CatchAll() {
  notFound();
}
