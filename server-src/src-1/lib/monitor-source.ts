import 'server-only';

// Live account data source, in order of preference:
//
//   1. bridge  — a terminal agent pushes snapshots to /api/bridge/accounts.
//                This is the primary path: it talks straight to the broker and
//                needs no third-party service.
//   2. metaapi — optional, only if a token and account id are configured.
//   3. stored  — whatever was last recorded, so the platform always renders.

export type LiveSnapshot = {
  source: 'bridge' | 'metaapi' | 'stored';
  balance: number;
  equity: number;
  openPositions: Array<{ symbol: string; profit: number; openedAt: Date }>;
};

/** A pushed snapshot older than this is treated as stale, not live. */
const BRIDGE_FRESH_MS = 30 * 60_000;

function parsePositions(
  raw: string | null,
): Array<{ symbol: string; profit: number; openedAt: Date }> {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as Array<{
      symbol?: string;
      profit?: number;
      openedAt?: string;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((p) => ({
      symbol: String(p.symbol ?? ''),
      profit: Number(p.profit ?? 0),
      openedAt: p.openedAt ? new Date(p.openedAt) : new Date(),
    }));
  } catch {
    return [];
  }
}

export type ClosedDeal = {
  externalId: string;
  symbol: string;
  type: string;
  lot: number;
  profit: number;
  openedAt: Date;
  closedAt: Date;
};

const PROVISIONING_BASE =
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

/**
 * Which region an account lives in.
 *
 * MetaApi serves each account from one region only, and calling the wrong one
 * answers 404 with "make sure your request URL matches your account region" —
 * indistinguishable, at a glance, from an account that does not exist. Rather
 * than hard-code a guess, ask the provisioning API once and remember it.
 */
const regionCache = new Map<string, string>();

async function accountRegion(metaApiId: string): Promise<string> {
  const cached = regionCache.get(metaApiId);
  if (cached) return cached;

  const fallback = process.env.METAAPI_REGION ?? 'new-york';
  try {
    const res = await fetch(
      `${PROVISIONING_BASE}/users/current/accounts/${metaApiId}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
        headers: {
          'auth-token': process.env.METAAPI_TOKEN as string,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return fallback;
    const body = (await res.json()) as { region?: string };
    const region = body?.region || fallback;
    regionCache.set(metaApiId, region);
    return region;
  } catch {
    return fallback;
  }
}

function metaApiBase(region: string): string {
  return `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
}

export function metaApiEnabled(
  metaApiId: string | null,
): metaApiId is string {
  return Boolean(process.env.METAAPI_TOKEN && metaApiId);
}

async function metaApiGet(region: string, path: string): Promise<unknown> {
  const res = await fetch(`${metaApiBase(region)}${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
    headers: {
      'auth-token': process.env.METAAPI_TOKEN as string,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    // Carry the reason. A silent failure here reads downstream as "the trader
    // has no data", which is the same shape as a genuinely empty account.
    const detail = await res.text().catch(() => '');
    throw new Error(`metaapi_${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

export async function fetchLiveSnapshot(account: {
  metaApiId: string | null;
  balance: number;
  equity: number;
  openPositions?: string | null;
  snapshotAt?: Date | null;
}): Promise<LiveSnapshot> {
  const positions = parsePositions(account.openPositions ?? null);
  const bridgeFresh =
    account.snapshotAt != null &&
    Date.now() - account.snapshotAt.getTime() < BRIDGE_FRESH_MS;

  const stored: LiveSnapshot = {
    source: bridgeFresh ? 'bridge' : 'stored',
    balance: account.balance,
    equity: account.equity,
    openPositions: positions,
  };

  // A fresh push from the terminal beats polling an external API.
  if (bridgeFresh) return stored;
  if (!metaApiEnabled(account.metaApiId)) return stored;

  try {
    const region = await accountRegion(account.metaApiId);
    const base = `/users/current/accounts/${account.metaApiId}`;
    const [info, positions] = await Promise.all([
      metaApiGet(region, `${base}/account-information`) as Promise<{
        balance?: number;
        equity?: number;
      }>,
      metaApiGet(region, `${base}/positions`) as Promise<
        Array<{ symbol?: string; profit?: number; time?: string }>
      >,
    ]);
    if (typeof info?.balance !== 'number' || typeof info?.equity !== 'number') {
      return stored;
    }
    return {
      source: 'metaapi',
      balance: info.balance,
      equity: info.equity,
      openPositions: (Array.isArray(positions) ? positions : []).map((p) => ({
        symbol: String(p.symbol ?? ''),
        profit: Number(p.profit ?? 0),
        openedAt: p.time ? new Date(p.time) : new Date(),
      })),
    };
  } catch (err) {
    // Fall back to the stored figures so the panel still renders, but say why:
    // an unreported failure here is indistinguishable from a quiet account.
    console.warn(`metaapi snapshot failed for ${account.metaApiId}:`, err);
    return stored;
  }
}

/**
 * Closed deals from the terminal's history, newest window first. MetaApi reports
 * one deal per fill, so entry and exit fills of the same position are paired by
 * position id before they become a trade.
 */
export async function fetchClosedDeals(
  metaApiId: string | null,
  since: Date,
): Promise<ClosedDeal[]> {
  if (!metaApiEnabled(metaApiId)) return [];

  type Deal = {
    id?: string;
    positionId?: string;
    symbol?: string;
    type?: string;
    volume?: number;
    profit?: number;
    entryType?: string;
    time?: string;
  };

  let deals: Deal[];
  try {
    const region = await accountRegion(metaApiId);
    const from = since.toISOString();
    const to = new Date().toISOString();
    deals = (await metaApiGet(
      region,
      `/users/current/accounts/${metaApiId}/history-deals/time/${from}/${to}`,
    )) as Deal[];
  } catch (err) {
    // Empty history and a failed call look identical downstream — every
    // history-based rule simply goes quiet. Say which one this was.
    console.warn(`metaapi deal history failed for ${metaApiId}:`, err);
    return [];
  }
  if (!Array.isArray(deals)) return [];

  const byPosition = new Map<string, { in?: Deal; out?: Deal; profit: number }>();
  for (const d of deals) {
    const pid = d.positionId;
    if (!pid || !d.symbol) continue;
    const entry = byPosition.get(pid) ?? { profit: 0 };
    if (d.entryType === 'DEAL_ENTRY_IN') entry.in = d;
    else if (d.entryType === 'DEAL_ENTRY_OUT') entry.out = d;
    entry.profit += Number(d.profit ?? 0);
    byPosition.set(pid, entry);
  }

  const closed: ClosedDeal[] = [];
  for (const [pid, entry] of byPosition) {
    if (!entry.in || !entry.out) continue; // still open
    const openedAt = entry.in.time ? new Date(entry.in.time) : null;
    const closedAt = entry.out.time ? new Date(entry.out.time) : null;
    if (!openedAt || !closedAt) continue;
    closed.push({
      externalId: `${metaApiId}:${pid}`,
      symbol: String(entry.in.symbol ?? entry.out.symbol ?? ''),
      type: entry.in.type === 'DEAL_TYPE_SELL' ? 'SELL' : 'BUY',
      lot: Number(entry.in.volume ?? 0),
      profit: entry.profit,
      openedAt,
      closedAt,
    });
  }
  return closed;
}

/**
 * Triggers an on-demand live extraction via the Python bot service and returns
 * the fresh snapshot.
 */
export async function triggerBotSync(account: {
  accountNumber: string;
  server?: string | null;
  password?: string | null;
  investorPassword?: string | null;
}): Promise<LiveSnapshot | null> {
  const botUrl = process.env.BOT_API_URL || 'http://127.0.0.1:8000';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000';
  const secret = process.env.BRIDGE_SECRET;
  const pwd = account.investorPassword?.trim() || account.password?.trim();

  if (!pwd) return null;

  try {
    const res = await fetch(
      `${botUrl.replace(/\/$/, '')}/api/bridge/sync-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountNumber: account.accountNumber,
          password: pwd,
          server: account.server || 'MetaQuotes-Demo',
          siteUrl,
          bridgeSecret: secret,
          headless: true,
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    if (!res.ok) {
      console.warn(
        `bot sync returned ${res.status} for ${account.accountNumber}`,
      );
      return null;
    }

    const json = (await res.json()) as {
      data?: {
        balance?: number;
        equity?: number;
        positions?: Array<{
          symbol?: string;
          profit?: number;
          openedAt?: string;
        }>;
      };
    };

    const snap = json.data || (json as unknown as Record<string, unknown>);
    if (
      typeof snap?.balance === 'number' &&
      typeof snap?.equity === 'number'
    ) {
      return {
        source: 'bridge',
        balance: snap.balance,
        equity: snap.equity,
        openPositions: (Array.isArray(snap.positions) ? snap.positions : []).map(
          (p) => ({
            symbol: String(p.symbol ?? ''),
            profit: Number(p.profit ?? 0),
            openedAt: p.openedAt ? new Date(p.openedAt) : new Date(),
          }),
        ),
      };
    }
    return null;
  } catch (err) {
    console.warn(`bot sync failed for ${account.accountNumber}:`, err);
    return null;
  }
}

/**
 * Triggers a full background sync cycle across all accounts via the Python bot.
 */
export async function triggerBotSyncAll(): Promise<boolean> {
  const botUrl = process.env.BOT_API_URL || 'http://127.0.0.1:8000';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000';
  const secret = process.env.BRIDGE_SECRET;

  try {
    const res = await fetch(`${botUrl.replace(/\/$/, '')}/api/bridge/sync-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        bridgeSecret: secret,
        headless: true,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    return res.ok;
  } catch (err) {
    console.warn('bot sync-all failed:', err);
    return false;
  }
}
