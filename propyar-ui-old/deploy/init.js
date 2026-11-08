/**
 * Prepares a production database: challenge plans, rule settings, and the first
 * administrator.
 *
 * Unlike the development seed, this never deletes anything. Every write is an
 * upsert, so running it a second time on a live site is harmless - existing
 * traders, orders and accounts are left completely untouched.
 *
 *   SEED_EMAIL=... SEED_PASSWORD=... node deploy/init.js
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Shared trading objectives - gold only, two phases.
const OBJ = {
  accountType: 'TWO_STEP',
  profitTarget: 10,
  profitTargetP2: 5,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  floatingRisk: 2.5,
  minTradingDays: 5,
  leverage: 30,
  profitSplit: 80,
};

const CHALLENGES = [
  { slug: 'gold-500', name: '500', price: 7, virtualCapital: 500 },
  { slug: 'gold-1k', name: '1K', price: 13, virtualCapital: 1000 },
  { slug: 'gold-3k', name: '3K', price: 33, virtualCapital: 3000 },
  { slug: 'gold-5k', name: '5K', price: 53, virtualCapital: 5000 },
  { slug: 'gold-10k', name: '10K', price: 93, virtualCapital: 10000, popular: true },
  { slug: 'gold-15k', name: '15K', price: 143, virtualCapital: 15000 },
  { slug: 'gold-25k', name: '25K', price: 213, virtualCapital: 25000 },
  { slug: 'gold-50k', name: '50K', price: 393, virtualCapital: 50000 },
  { slug: 'gold-100k', name: '100K', price: 0, virtualCapital: 100000, comingSoon: true },
];

const RULES = {
  weekendHoldingAllowed: true,
  newsTradingAllowed: false,
  consistencyRulePercent: 50,
  fundedMinTradingDays: 15,
  hftCooldownMinutes: 15,
  minHoldSeconds: 60,
  allowedSymbols: ['XAUUSD'],
};

async function main() {
  const email = (process.env.SEED_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_PASSWORD || '';

  if (!email || password.length < 8) {
    throw new Error('SEED_EMAIL and a SEED_PASSWORD of at least 8 characters are required');
  }

  // ---- Challenge plans -------------------------------------------------
  for (const challenge of CHALLENGES) {
    const data = { ...OBJ, ...challenge };
    await prisma.challenge.upsert({
      where: { slug: challenge.slug },
      update: data,
      create: data,
    });
  }
  console.log(`  plans ready (${CHALLENGES.length})`);

  // ---- Rule settings ---------------------------------------------------
  const value = JSON.stringify(RULES);
  await prisma.setting.upsert({
    where: { key: 'rules' },
    update: { value },
    create: { key: 'rules', value },
  });
  console.log('  rule settings ready');

  // ---- Administrator ---------------------------------------------------
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'ADMIN',
      emailVerified: new Date(),
    },
    create: {
      name: 'Administrator',
      email,
      passwordHash,
      role: 'ADMIN',
      kycStatus: 'APPROVED',
      emailVerified: new Date(),
    },
  });
  console.log(`  administrator ready: ${admin.email}`);

  // ---- Remove the development demo accounts ----------------------------
  // Only ever these two fixed addresses, and never the account just set up.
  const demoEmails = ['admin@propino.top', 'demo@propino.top'].filter(
    (e) => e !== email,
  );
  if (demoEmails.length) {
    const removed = await prisma.user.deleteMany({
      where: { email: { in: demoEmails } },
    });
    if (removed.count > 0) {
      console.log(`  removed ${removed.count} demo account(s)`);
    }
  }

  const [users, admins, challenges] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.challenge.count(),
  ]);
  console.log('');
  console.log(`  users: ${users}   administrators: ${admins}   plans: ${challenges}`);
}

main()
  .catch((err) => {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
