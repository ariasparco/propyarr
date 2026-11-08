import 'server-only';

// Minimal JSON-RPC client for BNB Smart Chain.
//
// Block explorers now gate BSC behind paid plans, and their sign-up is not
// reachable everywhere. Public RPC nodes need no key and no account, so the
// platform reads the chain directly. Several endpoints are tried in turn — if
// one is unreachable or rate limited, the next answers.

const ENDPOINTS = (
  process.env.BSC_RPC_URLS ??
  [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed2.binance.org',
    'https://bsc.drpc.org',
    'https://1rpc.io/bnb',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Remembering the endpoint that last worked avoids retrying dead ones.
let preferred = 0;

class RpcUnavailable extends Error {}

async function callOnce(
  url: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new RpcUnavailable(`http_${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: unknown };
  if (body.error) throw new RpcUnavailable(JSON.stringify(body.error));
  return body.result;
}

/** Calls every endpoint in turn; throws RpcUnavailable only if all fail. */
export async function rpc(method: string, params: unknown[]): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const index = (preferred + i) % ENDPOINTS.length;
    try {
      const result = await callOnce(ENDPOINTS[index], method, params);
      preferred = index; // stick with whatever just worked
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw new RpcUnavailable(
    `all endpoints failed: ${String(lastError).slice(0, 120)}`,
  );
}

export function isRpcUnavailable(err: unknown): boolean {
  return err instanceof RpcUnavailable;
}

export async function currentBlock(): Promise<number> {
  const hex = (await rpc('eth_blockNumber', [])) as string;
  return parseInt(hex, 16);
}

export type TransferLog = {
  txHash: string;
  from: string;
  value: bigint;
  blockNumber: number;
};

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function padAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

/**
 * Token transfers into `to` between two blocks. Queried in chunks because
 * public nodes cap how wide a single eth_getLogs range may be.
 */
export async function tokenTransfersTo(opts: {
  contract: string;
  to: string;
  fromBlock: number;
  toBlock: number;
  chunkSize?: number;
}): Promise<TransferLog[]> {
  const chunk = opts.chunkSize ?? 4_000;
  const logs: TransferLog[] = [];

  for (let start = opts.fromBlock; start <= opts.toBlock; start += chunk) {
    const end = Math.min(start + chunk - 1, opts.toBlock);
    const result = (await rpc('eth_getLogs', [
      {
        address: opts.contract,
        fromBlock: `0x${start.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
        topics: [TRANSFER_TOPIC, null, padAddress(opts.to)],
      },
    ])) as Array<{
      transactionHash?: string;
      topics?: string[];
      data?: string;
      blockNumber?: string;
    }>;

    for (const log of Array.isArray(result) ? result : []) {
      try {
        logs.push({
          txHash: log.transactionHash ?? '',
          from: `0x${(log.topics?.[1] ?? '').slice(-40)}`,
          value: BigInt(log.data ?? '0x0'),
          blockNumber: parseInt(log.blockNumber ?? '0x0', 16),
        });
      } catch {
        /* skip malformed log */
      }
    }
  }

  return logs;
}
