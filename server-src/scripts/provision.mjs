// Provisions the three test MetaQuotes-Demo accounts in MetaApi so the
// employer site can pull their live data. Run: node scripts/provision.mjs
import { readFileSync } from 'node:fs';

const token = readFileSync('metaapi-token.txt', 'utf-8').trim();
const BASE = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const headers = { 'auth-token': token, 'Accept': 'application/json', 'Content-Type': 'application/json' };

const accounts = [
  { login: '5054622771',  password: '!nY1OmDf',  investor: '_o5kQgOq',  name: 'TEST-5054622771' },
  { login: '111275103',  password: 'EpId*5Zg',  investor: '-v3cDtFp',  name: 'TEST-111275103' },
  { login: '5054622905', password: 'KyYu_q1z',  investor: '*vQvCs6g',  name: 'TEST-5054622905' },
];

async function create(a) {
  const res = await fetch(`${BASE}/users/current/accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: a.name,
      login: a.login,
      password: a.password,
      investorPassword: a.investor,
      server: 'MetaQuotes-Demo',
      platform: 'mt5',
      type: 'cloud-g1-small',
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`create ${a.login} -> ${res.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

async function deploy(id) {
  const res = await fetch(`${BASE}/users/current/accounts/${id}/deploy`, { method: 'POST', headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(`deploy ${id} -> ${res.status}: ${txt.slice(0, 300)}`);
  return true;
}

async function poll(id) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${BASE}/users/current/accounts/${id}`, { headers });
    const acc = await res.json();
    const st = acc.state;
    process.stdout.write(`  state=${st}\n`);
    if (st === 'DEPLOYED') return acc;
    if (st === 'DEPLOY_FAILED' || st === 'UNDEPLOYED') {
      // If undeployed, try deploying again once
      if (st === 'UNDEPLOYED' && i < 3) { await deploy(id); }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

for (const a of accounts) {
  try {
    console.log(`\n== ${a.login} ==`);
    const created = await create(a);
    console.log(`  created id=${created.id}`);
    await deploy(created.id);
    const live = await poll(created.id);
    console.log(`  RESULT: ${live ? 'DEPLOYED ' + live.id : 'NOT DEPLOYED'}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}
