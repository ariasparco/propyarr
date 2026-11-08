import type { Locale } from '@/i18n/config';

export type SyncLabels = {
  live: string;
  stale: string;
  never: string;
  minutesAgo: string;
  hoursAgo: string;
  daysAgo: string;
};

/** How long a pushed snapshot counts as live. Matches the monitoring engine. */
const FRESH_MINUTES = 30;

/**
 * Shows whether the terminal agent is still reporting for this account. A silent
 * agent means the figures on screen are old, which matters more than the figures
 * themselves — so it is called out rather than left to be inferred.
 */
export function SyncBadge({
  lastSyncedAt,
  locale,
  labels,
}: {
  lastSyncedAt: string | null;
  locale: Locale;
  labels: SyncLabels;
}) {
  if (!lastSyncedAt) {
    return (
      <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-[0.65rem] text-white/40">
        {labels.never}
      </span>
    );
  }

  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60_000),
  );
  const fresh = minutes < FRESH_MINUTES;

  const ago =
    minutes < 60
      ? labels.minutesAgo.replace('{n}', String(minutes))
      : minutes < 1440
        ? labels.hoursAgo.replace('{n}', String(Math.round(minutes / 60)))
        : labels.daysAgo.replace('{n}', String(Math.round(minutes / 1440)));

  return (
    <span
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
      className={
        'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] ' +
        (fresh
          ? 'bg-emerald-500/10 text-emerald-300'
          : 'bg-amber-500/10 text-amber-300')
      }
    >
      <span
        className={
          'h-1.5 w-1.5 rounded-full ' +
          (fresh ? 'animate-pulse bg-emerald-400' : 'bg-amber-400')
        }
      />
      {fresh ? labels.live : `${labels.stale} · ${ago}`}
    </span>
  );
}
