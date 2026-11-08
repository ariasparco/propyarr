/**
 * Confirms the MetaApi connection end to end, before trusting it with rules.
 *
 *   cd C:\propino
 *   node deploy\check-metaapi.js
 *
 * Reports, for every account the site knows about: whether a MetaApi id is
 * set, which region it lives in, and whether balance, equity, positions and
 * deal history actually come back. A rule can only be as right as its input,
 * so this answers "is the data arriving?" separately from "are the rules
 * correct?" - the two questions that are easy to confuse.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Read .env without pulling in a dependency.
for (const line of fs
  .readFileSync(path.join(process.cwd(), '.env'), 'utf8')
  .split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const TOKEN = process.env.METAAPI_TOKEN;
const PROVISIONING =
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

async function api(url) {
  const res = await fetch(url, {
    headers: { 'auth-token': TOKEN, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { ok: res.ok, status: res.status, body };
}

(async () => {
  console.log('');
  if (!TOKEN) {
    console.log('METAAPI_TOKEN is not set in C:\\propino\\.env — stopping.');
    process.exit(1);
  }
  console.log('token present, length', TOKEN.length);

  const listed = await api(`${PROVISIONING}/users/current/accounts?limit=100`);
  if (!listed.ok) {
    console.log('Cannot reach MetaApi:', listed.status, listed.body);
    process.exit(1);
  }
  const remote = Array.isArray(listed.body) ? listed.body : [];
  console.log('accounts registered in MetaApi:', remote.length);
  for (const a of remote) {
    console.log(`   ${a._id}  ${a.login}  ${a.server}  region=${a.region}  state=${a.state}`);
  }

  const accounts = await prisma.tradingAccount.findMany({
    select: {
      accountNumber: true,
      metaApiId: true,
      status: true,
      balance: true,
      equity: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('\naccounts on the site:', accounts.length);
  for (const a of accounts) {
    console.log('\n' + '='.repeat(58));
    console.log(`account ${a.accountNumber}   ${a.status}`);
    if (!a.metaApiId) {
      console.log('  no MetaApi id set — enter it in the admin panel, on the');
      console.log('  account, using the id shown in the MetaApi list above.');
      continue;
    }

    const meta = await api(`${PROVISIONING}/users/current/accounts/${a.metaApiId}`);
    if (!meta.ok) {
      console.log(`  MetaApi id ${a.metaApiId} -> ${meta.status}`, meta.body?.message || '');
      continue;
    }
    const region = meta.body.region;
    console.log(`  metaApiId : ${a.metaApiId}`);
    console.log(`  region    : ${region}   state: ${meta.body.state}`);

    const base = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${a.metaApiId}`;
    const info = await api(`${base}/account-information`);
    if (info.ok) {
      console.log(`  balance   : ${info.body.balance}   equity: ${info.body.equity}`);
    } else {
      console.log(`  account-information -> ${info.status}`, info.body?.message || '');
    }

    const pos = await api(`${base}/positions`);
    console.log(
      pos.ok
        ? `  open positions : ${Array.isArray(pos.body) ? pos.body.length : 0}`
        : `  positions -> ${pos.status}`,
    );

    const from = new Date(Date.now() - 60 * 86400000).toISOString();
    const to = new Date().toISOString();
    const hist = await api(`${base}/history-deals/time/${from}/${to}`);
    console.log(
      hist.ok
        ? `  deals (60d)    : ${Array.isArray(hist.body) ? hist.body.length : 0}`
        : `  history-deals -> ${hist.status}`,
    );
  }

  console.log('');
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
