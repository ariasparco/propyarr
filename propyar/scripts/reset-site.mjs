// Clears the platform back to a clean launch state.
//
//   node scripts/reset-site.mjs            → dry run: prints what would go
//   node scripts/reset-site.mjs --confirm  → actually does it
//   node scripts/reset-site.mjs --confirm --wipe-plans
//
// Kept on purpose:
//   • the admin account(s), so the panel can still be signed into
//   • the challenge plans, so the site still has something to sell
//   • the rule settings, so the engine keeps its configured thresholds
//
// Everything else — customers, their trading accounts, trades, orders,
// certificates, payouts, tickets, KYC, wallet history, discount codes and the
// audit log — is removed.
//
// A timestamped copy of the database file is written first. This is not
// reversible without it.
import { PrismaClient } from '@prisma/client';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const wipePlans = args.includes('--wipe-plans');

const prisma = new PrismaClient();

/** Locates the SQLite file behind DATABASE_URL so it can be copied first. */
function databaseFile() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) return null;
  const rel = url.slice(5).replace(/^\/\//, '');
  const candidates = [
    join(process.cwd(), 'prisma', rel),
    join(process.cwd(), rel),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function backup() {
  const file = databaseFile();
  if (!file) {
    console.log('  ! not a SQLite database — back it up yourself before continuing');
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(dirname(file), 'backups');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `before-reset-${stamp}.db`);
  copyFileSync(file, target);
  return target;
}

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true, name: true },
  });

  if (admins.length === 0) {
    console.log('\nNo admin account found. Refusing to run — the reset would');
    console.log('lock everyone out of the panel.\n');
    process.exitCode = 1;
    return;
  }

  const keepIds = admins.map((a) => a.id);

  const counts = {
    users: await prisma.user.count({ where: { id: { notIn: keepIds } } }),
    accounts: await prisma.tradingAccount.count(),
    trades: await prisma.trade.count(),
    orders: await prisma.order.count(),
    certificates: await prisma.certificate.count(),
    payouts: await prisma.payout.count(),
    tickets: await prisma.ticket.count(),
    kyc: await prisma.kyc.count(),
    wallet: await prisma.walletEntry.count(),
    discounts: await prisma.discountCode.count(),
    auditLog: await prisma.auditLog.count(),
    tokens: await prisma.authToken.count(),
    plans: await prisma.challenge.count(),
  };

  console.log('\n─── site reset ───\n');
  console.log('  keeping these admin logins:');
  for (const a of admins) console.log(`    · ${a.email}${a.name ? ` (${a.name})` : ''}`);
  console.log('');
  console.log('  removing:');
  console.log(`    users (other than the admins above) : ${counts.users}`);
  console.log(`    trading accounts                    : ${counts.accounts}`);
  console.log(`    trades                              : ${counts.trades}`);
  console.log(`    orders                              : ${counts.orders}`);
  console.log(`    certificates                        : ${counts.certificates}`);
  console.log(`    payouts                             : ${counts.payouts}`);
  console.log(`    support tickets                     : ${counts.tickets}`);
  console.log(`    KYC submissions                     : ${counts.kyc}`);
  console.log(`    wallet entries                      : ${counts.wallet}`);
  console.log(`    discount codes                      : ${counts.discounts}`);
  console.log(`    audit log entries                   : ${counts.auditLog}`);
  console.log(`    sessions / auth tokens              : ${counts.tokens}`);
  console.log('');
  console.log(
    wipePlans
      ? `    challenge plans                     : ${counts.plans}  (--wipe-plans)`
      : `  keeping ${counts.plans} challenge plan(s) and the rule settings.`,
  );

  if (!confirmed) {
    console.log('\n  DRY RUN — nothing was changed.');
    console.log('  Re-run with --confirm to apply.\n');
    return;
  }

  const saved = backup();
  if (saved) console.log(`\n  backup written: ${saved}`);

  // Order matters: children before parents, because SQLite will not always
  // cascade for us and a half-finished delete is worse than none.
  await prisma.trade.deleteMany({});
  await prisma.certificate.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.tradingAccount.deleteMany({});
  await prisma.ticketMessage.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.kyc.deleteMany({});
  await prisma.walletEntry.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.discountCode.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.authToken.deleteMany({});

  // Every non-admin user. Anything of theirs still referencing them is already
  // gone above, so this cannot fail on a foreign key.
  const removed = await prisma.user.deleteMany({
    where: { id: { notIn: keepIds } },
  });

  // The admins keep their login, but not their leftover balance or referral
  // history — those are numbers from the old data set.
  await prisma.user.updateMany({
    where: { id: { in: keepIds } },
    data: { walletBalance: 0, kycStatus: 'NONE' },
  });

  if (wipePlans) await prisma.challenge.deleteMany({});

  const after = {
    users: await prisma.user.count(),
    accounts: await prisma.tradingAccount.count(),
    orders: await prisma.order.count(),
    trades: await prisma.trade.count(),
    plans: await prisma.challenge.count(),
  };

  console.log('\n  done.\n');
  console.log(`    users left      : ${after.users}  (the admin${after.users === 1 ? '' : 's'})`);
  console.log(`    trading accounts: ${after.accounts}`);
  console.log(`    orders          : ${after.orders}`);
  console.log(`    trades          : ${after.trades}`);
  console.log(`    plans           : ${after.plans}`);
  console.log(`\n    ${removed.count} customer account(s) removed.\n`);
  console.log('  Sign in with the admin email above — the password is unchanged.\n');
}

main()
  .catch((err) => {
    console.error('\nreset failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
