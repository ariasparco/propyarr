import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } }) || await prisma.user.findFirst();
  if (!admin) {
    console.log('❌ کاربر ادمین در دیتابیس یافت نشد.');
    return;
  }

  const accounts = [
    { num: '111610507', pass: '*fArE4Do', cap: 1000, slug: 'gold-1k', name: '1K', price: 19 },
    { num: '5054622771', pass: '_o5kQgOq', cap: 5000, slug: 'gold-5k', name: '5K', price: 59 },
    { num: '111275103', pass: '-v3cDtFp', cap: 10000, slug: 'gold-10k', name: '10K', price: 93 },
    { num: '5054622905', pass: '*vQvCs6g', cap: 3000, slug: 'gold-3k', name: '3K', price: 39 },
  ];

  for (const a of accounts) {
    const ch = await prisma.challenge.upsert({
      where: { slug: a.slug },
      update: {},
      create: {
        slug: a.slug,
        name: a.name,
        accountType: 'TWO_STEP',
        price: a.price,
        virtualCapital: a.cap,
        profitTarget: 10,
        profitTargetP2: 5,
        dailyDrawdown: 5,
        maxDrawdown: 10,
        floatingRisk: 2.5,
        minTradingDays: 5,
        leverage: 30,
        profitSplit: 80,
        active: true
      }
    });

    const orderId = 'order_' + a.num;
    await prisma.order.upsert({
      where: { id: orderId },
      update: {},
      create: {
        id: orderId,
        userId: admin.id,
        challengeId: ch.id,
        amount: a.price,
        paymentStatus: 'PAID',
        paymentMethod: 'admin',
        fulfillment: 'COMPLETED',
        kind: 'PURCHASE'
      }
    });

    await prisma.tradingAccount.upsert({
      where: { accountNumber: a.num },
      update: {
        challengeId: ch.id,
        status: 'ACTIVE',
        phase: 'PHASE_1',
        snapshotAt: new Date(),
        snapshotSource: 'bridge'
      },
      create: {
        accountNumber: a.num,
        userId: admin.id,
        challengeId: ch.id,
        orderId: orderId,
        platform: 'MT5',
        server: 'MetaQuotes-Demo',
        password: '••••••••',
        investorPassword: a.pass,
        startingBalance: a.cap,
        balance: a.cap,
        equity: a.cap,
        dayStartBalance: a.cap,
        dayLowEquity: a.cap,
        lowestEquity: a.cap,
        status: 'ACTIVE',
        phase: 'PHASE_1',
        snapshotAt: new Date(),
        snapshotSource: 'bridge'
      }
    });
    console.log('✅ Added account #' + a.num);
  }
  console.log('\n🎉 تمامی ۴ حساب با موفقیت در دیتابیس ثبت شدند!');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
