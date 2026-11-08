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

// Propyar objectives per challenge model. Every model is gold-only (XAU/USD).
const ONE_STEP = {
  accountType: 'ONE_STEP',
  profitTarget: 8,
  profitTargetP2: 0,
  dailyDrawdown: 3,
  maxDrawdown: 6,
  floatingRisk: 2,
  minTradingDays: 5,
  leverage: 30,
  profitSplit: 80, // tiered 60 → 70 → 80
} satisfies Partial<ChallengeSeed>;

const TWO_STEP = {
  accountType: 'TWO_STEP',
  profitTarget: 10, // phase 1
  profitTargetP2: 5, // phase 2
  dailyDrawdown: 5,
  maxDrawdown: 12,
  floatingRisk: 2,
  minTradingDays: 5,
  leverage: 30,
  profitSplit: 80, // tiered 60 → 70 → 80
} satisfies Partial<ChallengeSeed>;

// "Direct Real": a live account from day one. No daily drawdown (0 = off);
// profitTarget is the 5% balance gain needed before a payout.
const DIRECT_REAL = {
  accountType: 'INSTANT',
  profitTarget: 5,
  profitTargetP2: 0,
  dailyDrawdown: 0,
  maxDrawdown: 5,
  floatingRisk: 2,
  minTradingDays: 10,
  leverage: 30,
  profitSplit: 70, // tiered 50 → 60 → 70
} satisfies Partial<ChallengeSeed>;

const SIZES: Array<[string, number]> = [
  ['500', 500],
  ['1K', 1000],
  ['3K', 3000],
  ['5K', 5000],
  ['10K', 10000],
  ['15K', 15000],
];

const PRICES = {
  ONE_STEP: [11, 16, 39, 55, 99, 145],
  TWO_STEP: [7, 12, 33, 49, 88, 119],
  INSTANT: [15, 29, 86, 147, 298, 475],
};

const challenges: ChallengeSeed[] = [
  ...SIZES.map(([name, cap], i) => ({
    slug: `1s-${name.toLowerCase()}`, name, price: PRICES.ONE_STEP[i],
    virtualCapital: cap, popular: cap === 5000, ...ONE_STEP,
  })),
  ...SIZES.map(([name, cap], i) => ({
    slug: `2s-${name.toLowerCase()}`, name, price: PRICES.TWO_STEP[i],
    virtualCapital: cap, popular: cap === 5000, ...TWO_STEP,
  })),
  ...SIZES.map(([name, cap], i) => ({
    slug: `dr-${name.toLowerCase()}`, name, price: PRICES.INSTANT[i],
    virtualCapital: cap, popular: cap === 5000, ...DIRECT_REAL,
  })),
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
      email: 'admin@propyar.top',
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
      email: 'demo@propyar.top',
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
      challengeId: created['2s-10k'],
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
      challengeId: created['2s-10k'],
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
      challengeId: created['1s-15k'],
      amount: 145,
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
      challengeId: created['1s-15k'],
      accountNumber: '50239912',
      platform: 'MT5',
      server: 'MT5-Live',
      startingBalance: 15000,
      balance: 16300,
      equity: 16300,
      status: 'FUNDED',
      phase: 'FUNDED',
      // Funded well past the payout waiting period so the demo can withdraw.
      fundedAt: daysAgo(40),
      tradingDays: 12,
    },
  });
  await prisma.trade.createMany({
    data: makeTrades(accountB.id, [130, 220, -60, 270, 340, -80, 140, 300]),
  });
  await prisma.payout.createMany({
    data: [
      {
        userId: demo.id,
        accountId: accountB.id,
        amount: 1200,
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
        amount: 450,
        currency: 'USD',
        method: 'crypto',
        wallet: 'TXk9…a7Qd (USDT-TRC20)',
        status: 'REQUESTED',
        createdAt: daysAgo(1),
      },
    ],
  });
  // Sample funded traders so the homepage "latest payouts" list has rows to
  // show in local development. Production lists real PAID payouts only.
  const sampleTraders: Array<[string, string, string, number, number]> = [
    ['Saman Karimi', 'saman@propyar.top', '50240011', 15000, 5800],
    ['Mehdi Rahimi', 'mehdi@propyar.top', '50240012', 10000, 1200],
    ['Ali Tavakoli', 'ali@propyar.top', '50240013', 15000, 3450],
  ];
  for (const [i, [name, email, number, capital, paid]] of sampleTraders.entries()) {
    const trader = await prisma.user.create({
      data: { name, email, passwordHash: password, role: 'USER', emailVerified: new Date() },
    });
    const account = await prisma.tradingAccount.create({
      data: {
        userId: trader.id,
        challengeId: created[capital === 15000 ? '1s-15k' : '2s-10k'],
        accountNumber: number,
        platform: 'MT5',
        server: 'MT5-Live',
        startingBalance: capital,
        balance: capital,
        equity: capital,
        status: 'FUNDED',
        phase: 'FUNDED',
        fundedAt: daysAgo(60),
        tradingDays: 20,
      },
    });
    await prisma.payout.create({
      data: {
        userId: trader.id,
        accountId: account.id,
        amount: paid,
        method: 'crypto',
        wallet: 'USDT-BEP20',
        status: 'PAID',
        createdAt: daysAgo(6 - i * 2),
        processedAt: daysAgo(5 - i * 2),
      },
    });
  }

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
  console.log('   Admin: admin@propyar.top / Password123!');
  console.log('   User:  demo@propyar.top  / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
