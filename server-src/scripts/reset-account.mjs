// Clears everything a test left behind on one account.
//
//   node scripts/reset-account.mjs 5055004470          # show what would change
//   node scripts/reset-account.mjs 5055004470 --apply
//
// The mock MetaApi server drove an account's equity down to prove the rules
// fire, which they did -- it was failed on a daily-drawdown breach computed
// from invented figures. `risk:repair` will not undo that, and correctly so:
// from its point of view the stored equity is real and the breach was earned.
//
// This clears the invented figures and the marks derived from them, so the
// next push from the terminal re-establishes the account from live data.
import { DatabaseSync } from 'node:sqlite';

const number = process.argv[2];
const apply = process.argv.includes('--apply');

if (!number || number.startsWith('--')) {
  console.error('Usage: node scripts/reset-account.mjs <accountNumber> [--apply]');
  process.exit(1);
}

const db = new DatabaseSync('prisma/dev.db');

const row = db
  .prepare(
    `SELECT id, accountNumber, status, breachRule, startingBalance, balance,
            equity, dayLowEquity, lowestEquity, worstFloating, snapshotSource
     FROM TradingAccount WHERE accountNumber = ?`,
  )
  .get(number);

if (!row) {
  console.error(`No trading account with number ${number}.`);
  process.exit(1);
}

console.log('');
console.log(apply ? '-- APPLYING --' : '-- DRY RUN (pass --apply to write) --');
console.log('');
console.log(`#${row.accountNumber}`);
console.log(`   status         ${row.status}  ${row.breachRule ?? ''}`);
console.log(`   balance        ${row.balance}`);
console.log(`   equity         ${row.equity}`);
console.log(`   dayLowEquity   ${row.dayLowEquity ?? '-'}`);
console.log(`   lowestEquity   ${row.lowestEquity ?? '-'}`);
console.log(`   worstFloating  ${row.worstFloating ?? '-'}`);
console.log(`   source         ${row.snapshotSource ?? '-'}`);
console.log('');
console.log('will become:');
console.log(`   status         ACTIVE`);
// Equity is set to balance rather than to a guess: with no position open they
// are the same number, and the next real push corrects it either way.
console.log(`   equity         ${row.balance}   (= balance, until real data arrives)`);
console.log(`   watermarks     cleared`);
console.log(`   breach fields  cleared`);
console.log('');

if (!apply) {
  console.log('Nothing was written.');
  process.exit(0);
}

db.prepare(
  `UPDATE TradingAccount
      SET status = 'ACTIVE',
          equity = balance,
          dayLowEquity = NULL,
          dayLowKey = NULL,
          lowestEquity = NULL,
          worstFloating = NULL,
          dayStartBalance = NULL,
          breachRule = NULL,
          breachDetail = NULL,
          breachedAt = NULL,
          breachSource = NULL,
          metaApiId = NULL,
          snapshotSource = NULL,
          snapshotAt = NULL
    WHERE id = ?`,
).run(row.id);

console.log(`#${row.accountNumber} reset. It will rejoin the roster on the next sync.`);
console.log('');
