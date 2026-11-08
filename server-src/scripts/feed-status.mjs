// Is the data feed actually alive?
//
//   node scripts/feed-status.mjs
//
// A file rather than an inline -e command: the query has to carry both single
// and double quotes, and PowerShell mangles those before node ever sees them.
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('prisma/dev.db');

const rows = db
  .prepare(
    `SELECT accountNumber, status, snapshotSource, balance, equity, snapshotAt,
            investorPassword
     FROM TradingAccount
     ORDER BY snapshotAt DESC`,
  )
  .all();

const now = Date.now();
const fmt = (n) => (n == null ? '—' : n.toFixed(2));

// An empty platform is not a broken feed.
//
// Reporting "the EA is not pushing" when there is simply nothing to push about
// sends whoever reads it hunting through MetaTrader logs for a fault that does
// not exist.
if (rows.length === 0) {
  console.log('');
  console.log('No trading accounts exist yet — nothing to monitor.');
  console.log('');
  console.log('This is the idle state, not a fault. Monitoring starts on its own');
  console.log('as soon as an account is created:');
  console.log('');
  console.log('   admin completes an order (with the investor password)');
  console.log('     -> the account joins the roster');
  console.log('     -> propino-farm-sync starts its terminal within 10 minutes');
  console.log('     -> the EA pushes every 5 seconds from then on');
  console.log('');
  process.exit(0);
}

console.log('');
console.log('account       status   source    balance     equity      last data');
console.log('─'.repeat(74));

let live = 0;
// A live account with no read-only password cannot be signed into by any
// terminal, so nothing is watching it — and nothing anywhere says so. That is
// the failure worth catching before a customer is trading on it.
const unwatchable = [];
for (const r of rows) {
  const pw = (r.investorPassword ?? '').trim();
  const monitorable = pw && pw !== '•'.repeat(8);
  if (!monitorable && (r.status === 'ACTIVE' || r.status === 'FUNDED')) {
    unwatchable.push(r.accountNumber);
  }
  const ageMs = r.snapshotAt ? now - Number(r.snapshotAt) : null;
  let age;
  if (ageMs == null) age = 'never';
  else if (ageMs < 60_000) age = `${Math.round(ageMs / 1000)}s ago`;
  else if (ageMs < 3_600_000) age = `${Math.round(ageMs / 60_000)}m ago`;
  else age = `${Math.round(ageMs / 3_600_000)}h ago`;

  // Under a minute means something is pushing continuously — which is the
  // whole point of the terminal farm.
  const fresh = ageMs != null && ageMs < 60_000;
  if (fresh) live += 1;

  console.log(
    `${r.accountNumber.padEnd(13)} ${String(r.status).padEnd(8)} ` +
      `${String(r.snapshotSource ?? '—').padEnd(9)} ` +
      `${fmt(r.balance).padStart(10)} ${fmt(r.equity).padStart(10)}   ` +
      `${fresh ? '✅ ' : '   '}${age}`,
  );
}

console.log('');
if (unwatchable.length > 0) {
  console.log(
    `⚠  ${unwatchable.length} live account(s) have no investor password, so nothing can monitor them:`,
  );
  for (const n of unwatchable) console.log(`     #${n}`);
  console.log('   Admin panel -> Trading accounts -> Edit login details');
  console.log('');
}
if (live > 0) {
  console.log(`✅ ${live} account(s) receiving live data — the EA is pushing.`);
} else {
  console.log('❌ No account has fresh data. The EA is not pushing.');
  console.log('   In MetaTrader, open the Experts tab and read the last lines:');
  console.log('     - "WebRequest is not allowed"  -> whitelist the URL in Options');
  console.log('     - "rejected (403)"             -> BridgeSecret does not match .env');
  console.log('     - nothing at all               -> the EA is not on a chart');
}
console.log('');
