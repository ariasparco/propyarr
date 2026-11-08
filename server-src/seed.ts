import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type ChallengeSeed = {
  slug: string;
  name: string;
  accountType: string;
  price: number;
  virtualCapital: number;
  profitTarget: number;
  profitTargetP2: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  floatingRisk: number;
  minTradingDays: number;
  leverage: number;
  profitSplit: number;
  popular?: boolean;
  comingSoon?: boolean;
};

// Uniform trading objectives (Gold Classic — two-phase, XAU/USD only)
const OBJ = {
  accountType: 'TWO_STEP',
  profitTarget: 10, // phase 1
  profitTargetP2: 5, // phase 2
  dailyDrawdown: 5,
  maxDrawdown: 10,
  floatingRisk: 2.5,
  minTradingDays: 5,
  leverage: 30,
  profitSplit: 80,
} satisfies Partial<ChallengeSeed>;

const challenges: ChallengeSeed[] = [
  { slug: 'gold-500', name: '500', price: 7, virtualCapital: 500, ...OBJ },
  { slug: 'gold-1k', name: '1K', price: 13, virtualCapital: 1000, ...OBJ },
  { slug: 'gold-3k', name: '3K', price: 33, virtualCapital: 3000, ...OBJ },
  { slug: 'gold-5k', name: '5K', price: 53, virtualCapital: 5000, ...OBJ },
  { slug: 'gold-10k', name: '10K', price: 93, virtualCapital: 10000, popular: true, ...OBJ },
  { slug: 'gold-15k', name: '15K', price: 143, virtualCapital: 15000, ...OBJ },
  { slug: 'gold-25k', name: '25K', price: 213, virtualCapital: 25000, ...OBJ },
  { slug: 'gold-50k', name: '50K', price: 393, virtualCapital: 50000, ...OBJ },
  { slug: 'gold-100k', name: '100K', price: 0, virtualCapital: 100000, comingSoon: true, ...OBJ },
];

const symbols = ['XAUUSD']; // Gold-only firm

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Hold times well above the one-minute floor so demo trades count as real
// profit rather than being voided by the minimum hold time rule.
const holdMinutes = [95, 140, 65, 180, 110, 75, 155, 120];

function makeTrades(accountId: string, profits: number[]) {
  return profits.map((profit, i) => {
    const openedAt = daysAgo(profits.length - i);
    const closedAt = new Date(
      openedAt.getTime() + holdMinutes[i % holdMinutes.length] * 60_000,
    );
    return {
      accountId,
      symbol: symbols[i % symbols.length],
      type: profit >= 0 ? 'BUY' : 'SELL',
      lot: Math.round((0.2 + Math.random() * 1.8) * 100) / 100,
      openPrice: Math.round((1 + Math.random()) * 10000) / 100,
      closePrice: Math.round((1 + Math.random()) * 10000) / 100,
      profit,
      openedAt,
      closedAt,
    };
  });
}

async function main() {
  console.log('🌱 Seeding database…');

  // Reset (order matters for FKs)
  await prisma.trade.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.tradingAccount.deleteMany();
  await prisma.order.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.challenge.deleteMany();

  // Challenges
  const created: Record<string, string> = {};
  for (const c of challenges) {
    const row = await prisma.challenge.create({ data: c });
    created[c.slug] = row.id;
  }
  console.log(`  ✓ ${challenges.length} challenges`);

  // Users
  const password = await bcrypt.hash('Password123!', 12);
  const admin = await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@propino.top',
      passwordHash: password,
      role: 'ADMIN',
      emailVerified: new Date(),
      kycStatus: 'APPROVED',
      country: 'AE',
    },
  });
  const demo = await prisma.user.create({
    data: {
      name: 'Demo Trader',
      email: 'demo@propino.top',
      passwordHash: password,
      role: 'USER',
      emailVerified: new Date(),
      kycStatus: 'APPROVED',
      country: 'DE',
    },
  });
  console.log('  ✓ admin + demo users');

  // Demo account A — active two-step 100K, in progress
  const orderA = await prisma.order.create({
    data: {
      userId: demo.id,
      challengeId: created['gold-10k'],
      amount: 93,
      currency: 'USD',
      paymentStatus: 'PAID',
      paymentMethod: 'mock',
      paymentRef: 'seed_A',
    },
  });
  const accountA = await prisma.tradingAccount.create({
    data: {
      userId: demo.id,
      orderId: orderA.id,
      challengeId: created['gold-10k'],
      accountNumber: '50231884',
      platform: 'MT5',
      server: 'MT5-Demo',
      startingBalance: 10000,
      balance: 10820,
      equity: 10870,
      status: 'ACTIVE',
      phase: 'PHASE_1',
      tradingDays: 6,
    },
  });
  await prisma.trade.createMany({
    data: makeTrades(accountA.id, [180, -70, 240, 120, -45, 190, 150, 55]),
  });

  // Demo account B — funded 50K with payouts
  const orderB = await prisma.order.create({
    data: {
      userId: demo.id,
      challengeId: created['gold-50k'],
      amount: 393,
      currency: 'USD',
      paymentStatus: 'PAID',
      paymentMethod: 'crypto',
      paymentRef: 'seed_B',
    },
  });
  const accountB = await prisma.tradingAccount.create({
    data: {
      userId: demo.id,
      orderId: orderB.id,
      challengeId: created['gold-50k'],
      accountNumber: '50239912',
      platform: 'MT5',
      server: 'MT5-Live',
      startingBalance: 50000,
      balance: 54200,
      equity: 54200,
      status: 'FUNDED',
      phase: 'FUNDED',
      // Funded well past the payout waiting period so the demo can withdraw.
      fundedAt: daysAgo(40),
      tradingDays: 12,
    },
  });
  await prisma.trade.createMany({
    data: makeTrades(accountB.id, [430, 720, -180, 900, 1120, -260, 470, 1000]),
  });
  await prisma.payout.createMany({
    data: [
      {
        userId: demo.id,
        accountId: accountB.id,
        amount: 3000,
        currency: 'USD',
        method: 'crypto',
        wallet: 'TXk9…a7Qd (USDT-TRC20)',
        status: 'PAID',
        processedAt: daysAgo(20),
        createdAt: daysAgo(22),
      },
      {
        userId: demo.id,
        accountId: accountB.id,
        amount: 1200,
        currency: 'USD',
        method: 'crypto',
        wallet: 'TXk9…a7Qd (USDT-TRC20)',
        status: 'REQUESTED',
        createdAt: daysAgo(1),
      },
    ],
  });
  console.log('  ✓ demo accounts, trades & payouts');

  // Default rule settings
  const rules = JSON.stringify({
    weekendHoldingAllowed: true,
    newsTradingAllowed: false,
    consistencyRulePercent: 50,
    fundedMinTradingDays: 15,
    hftCooldownMinutes: 5,
    minHoldSeconds: 60,
    allowedSymbols: ['XAUUSD'],
  });
  await prisma.setting.upsert({
    where: { key: 'rules' },
    update: { value: rules },
    create: { key: 'rules', value: rules },
  });

  console.log('\n✅ Done. Login credentials:');
  console.log('   Admin: admin@propino.top / Password123!');
  console.log('   User:  demo@propino.top  / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
