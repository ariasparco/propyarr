// A stand-in for MetaApi, so the integration can be proven before it is paid for.
//
//   npx tsx scripts/metaapi-mock.ts                 # equity holds steady
//   npx tsx scripts/metaapi-mock.ts --drop 2        # equity falls $2/second
//   npx tsx scripts/metaapi-mock.ts --drop 2 --positions 2
//
// MetaApi refuses to provision anything on an unfunded subscription, so there is
// no way to discover whether *our* half works until after the invoice. This
// answers the half that is under our control: it speaks the same endpoints the
// platform calls, so pointing the app at it exercises the real code path —
// provisioning, deploy, the source-priority change, the snapshot clock, the
// parallel sweep, the panel, and the rules themselves.
//
// What it cannot prove is whether MetaApi's own cloud terminal can reach the
// broker. That part is their product, and the only way to test it is to use it.
//
// Numbers come from the real database so the panel shows plausible figures, and
// `--drop` walks equity down so a drawdown breach can be watched happening.
import { createServer } from 'node:http';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PORT = Number(process.env.METAAPI_MOCK_PORT ?? 8787);

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
};

/** Dollars per second to walk equity down. 0 holds it steady. */
const DROP_PER_SEC = arg('drop', 0);
/** How many open positions to report. Two or more switches on floating risk. */
const OPEN_POSITIONS = arg('positions', 0);

const startedAt = Date.now();

/** metaApiId -> the trading account it stands for. */
const registry = new Map<
  string,
  { accountNumber: string; balance: number; login: string; server: string }
>();

function newId(): string {
  return 'mock-' + Math.random().toString(16).slice(2, 10);
}

async function loadKnownAccounts() {
  const rows = await prisma.tradingAccount.findMany({
    select: { accountNumber: true, balance: true, server: true, metaApiId: true },
  });
  for (const r of rows) {
    if (r.metaApiId) {
      registry.set(r.metaApiId, {
        accountNumber: r.accountNumber,
        balance: r.balance,
        login: r.accountNumber,
        server: r.server,
      });
    }
  }
  if (registry.size) {
    console.log(`restored ${registry.size} already-linked account(s)`);
  }
}

/** Equity for an account right now, given how long the server has been up. */
function equityFor(balance: number): number {
  const elapsedSec = (Date.now() - startedAt) / 1000;
  const drop = DROP_PER_SEC * elapsedSec;
  return Math.round((balance - drop) * 100) / 100;
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // The real API authenticates with this header; requiring it here keeps the
  // stand-in honest about what the client actually sends.
  if (!req.headers['auth-token']) {
    return json(res, 401, { error: 'UnauthorizedError', message: 'auth-token missing' });
  }

  // ── List accounts ────────────────────────────────────────
  if (method === 'GET' && path === '/users/current/accounts') {
    return json(
      res,
      200,
      [...registry.entries()].map(([id, a]) => ({
        _id: id,
        login: a.login,
        name: `propino-${a.accountNumber}`,
        server: a.server,
        region: 'london',
        state: 'DEPLOYED',
        connectionStatus: 'CONNECTED',
      })),
    );
  }

  // ── Create account ───────────────────────────────────────
  if (method === 'POST' && path === '/users/current/accounts') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed: { login?: string; server?: string } = {};
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      return json(res, 400, { error: 'ValidationError' });
    }
    const login = String(parsed.login ?? '');
    const row = await prisma.tradingAccount.findUnique({
      where: { accountNumber: login },
      select: { balance: true, server: true },
    });
    if (!row) {
      return json(res, 404, {
        error: 'NotFoundError',
        message: `no trading account ${login} in the database`,
      });
    }
    const id = newId();
    registry.set(id, {
      accountNumber: login,
      balance: row.balance,
      login,
      server: row.server,
    });
    console.log(`created ${id} for #${login} (balance ${row.balance})`);
    return json(res, 201, { id, _id: id });
  }

  const accountMatch = path.match(/^\/users\/current\/accounts\/([^/]+)(\/.*)?$/);
  if (accountMatch) {
    const id = accountMatch[1];
    const rest = accountMatch[2] ?? '';
    const acc = registry.get(id);
    if (!acc) return json(res, 404, { error: 'NotFoundError', message: id });

    // ── Deploy / undeploy ──────────────────────────────────
    if (method === 'POST' && (rest === '/deploy' || rest === '/undeploy')) {
      console.log(`${rest.slice(1)} ${id}`);
      return json(res, 204, {});
    }

    // ── Which region serves it ─────────────────────────────
    if (method === 'GET' && rest === '') {
      return json(res, 200, {
        _id: id,
        login: acc.login,
        region: 'london',
        state: 'DEPLOYED',
        connectionStatus: 'CONNECTED',
      });
    }

    // ── Live figures ───────────────────────────────────────
    if (method === 'GET' && rest === '/account-information') {
      const equity = equityFor(acc.balance);
      return json(res, 200, {
        broker: 'Mock Broker',
        currency: 'USD',
        server: acc.server,
        balance: acc.balance,
        equity,
        margin: 0,
        freeMargin: equity,
        leverage: 100,
      });
    }

    if (method === 'GET' && rest === '/positions') {
      const equity = equityFor(acc.balance);
      const floating = equity - acc.balance;
      if (OPEN_POSITIONS <= 0) return json(res, 200, []);
      // Split the floating figure evenly, so the combined loss matches the
      // equity gap exactly and the floating-risk rule sees a coherent picture.
      const each = Math.round((floating / OPEN_POSITIONS) * 100) / 100;
      return json(
        res,
        200,
        Array.from({ length: OPEN_POSITIONS }, (_, i) => ({
          id: `${id}-pos-${i}`,
          symbol: 'XAUUSD',
          type: i % 2 === 0 ? 'POSITION_TYPE_BUY' : 'POSITION_TYPE_SELL',
          volume: 0.1,
          profit: each,
          time: new Date(startedAt).toISOString(),
        })),
      );
    }

    // ── Deal history ───────────────────────────────────────
    // Empty on purpose: the real trade history is already in the database and
    // the platform must not be fed invented deals on top of it.
    if (method === 'GET' && rest.startsWith('/history-deals/')) {
      return json(res, 200, []);
    }

    // ── Delete ─────────────────────────────────────────────
    if (method === 'DELETE' && rest === '') {
      registry.delete(id);
      return json(res, 204, {});
    }
  }

  console.log(`unhandled ${method} ${path}`);
  return json(res, 404, { error: 'NotFoundError', path });
});

loadKnownAccounts()
  .then(() => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log('='.repeat(64));
      console.log(`MetaApi stand-in listening on http://127.0.0.1:${PORT}`);
      console.log(
        DROP_PER_SEC > 0
          ? `equity falls $${DROP_PER_SEC}/second from each account's balance`
          : 'equity holds steady at each account\'s balance',
      );
      console.log(`open positions reported: ${OPEN_POSITIONS}`);
      console.log('='.repeat(64));
      console.log('This serves invented figures. Never point production at it.');
    });
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
