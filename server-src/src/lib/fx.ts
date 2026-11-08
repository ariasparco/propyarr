import 'server-only';

// Live USD → IRR (Rial) rate for the Rial checkout.
// Free-market rate is pulled from public price feeds and cached in-process.
// USD_IRR_RATE in .env is only the fallback when every feed is unreachable.

const TTL_MS = 30 * 60 * 1000;
const MIN_RIAL = 200_000;
const MAX_RIAL = 50_000_000;

let cache: { rate: number; at: number; source: string } | null = null;

/** Feeds quote either Rial or Toman; normalise to Rial and sanity-check. */
function normalise(raw: unknown): number | null {
  const n =
    typeof raw === 'number'
      ? raw
      : Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const rial = n < MIN_RIAL ? n * 10 : n;
  return rial >= MIN_RIAL && rial <= MAX_RIAL ? Math.round(rial) : null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fromTgju(host: string): Promise<number | null> {
  const data = (await getJson(`https://${host}/ajax.json`)) as {
    current?: Record<string, { p?: string }>;
  };
  return normalise(data?.current?.price_dollar_rl?.p);
}

// Same feed behind several hosts — if one is unreachable the next is tried.
const FEEDS: Array<[string, () => Promise<number | null>]> = [
  ['tgju-1', () => fromTgju('call1.tgju.org')],
  ['tgju-2', () => fromTgju('call2.tgju.org')],
  ['tgju-3', () => fromTgju('call3.tgju.org')],
];

export function fallbackRate(): number {
  return Number(process.env.USD_IRR_RATE) || 1_200_000;
}

export async function getUsdIrrRate(): Promise<{
  rate: number;
  source: string;
  live: boolean;
}> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { rate: cache.rate, source: cache.source, live: true };
  }
  for (const [source, fetcher] of FEEDS) {
    try {
      const rate = await fetcher();
      if (rate) {
        cache = { rate, at: Date.now(), source };
        return { rate, source, live: true };
      }
    } catch {
      /* try the next feed */
    }
  }
  // Serve a stale cached value before falling back to the static env rate.
  if (cache) return { rate: cache.rate, source: cache.source, live: false };
  return { rate: fallbackRate(), source: 'env', live: false };
}

export async function usdToRial(amountUsd: number): Promise<number> {
  const { rate } = await getUsdIrrRate();
  // Gateways reject odd amounts below 10 Rial; round to the nearest 10.
  return Math.round((amountUsd * rate) / 10) * 10;
}
