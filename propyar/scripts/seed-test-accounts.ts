// Loads the REAL trade history of the three MetaQuotes-Demo test accounts
// (exported by project_me) into the karfarma SQLite DB so the panel analyses
// them with the fixed rule engine. Run: npx tsx scripts/seed-test-accounts.ts
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();
const SRC = 'C:/Users/SURFACE/Desktop/karlanser/karlancer/prop bot analyse/project_me/';

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/\./g, '-'));
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: 'demo@propino.top' } });
  if (!demo) throw new Error('demo user missing — run seed first');

  const map: Record<string, string> = {
    '5054622771': 'gold-5k',
    '5054622905': 'gold-3k',
    '111275103': 'gold-10k',
  };

  for (const login of Object.keys(map)) {
    const j = JSON.parse(readFileSync(`${SRC}history_${login}.json`, 'utf-8'));
    const summary = j.summary;
    const challenge = await prisma.challenge.findUnique({ where: { slug: map[login] } });
    if (!challenge) throw new Error(`challenge ${map[login]} missing`);

    const starting = Number(summary.deposit);
    const balance = Number(summary.balance);
    const equity = Number(summary.equity);

    const account = await prisma.tradingAccount.create({
      data: {
        userId: demo.id,
        challengeId: challenge.id,
        accountNumber: login,
        platform: 'MT5',
        server: String(summary.server ?? 'MetaQuotes-Demo'),
        startingBalance: starting,
        balance,
        equity,
        status: 'ACTIVE',
        phase: 'PHASE_1',
        tradingDays: 0,
      },
    });

    const trades = (j.trades ?? []).map((t: any) => ({
      accountId: account.id,
      symbol: String(t.symbol),
      type: String(t.type).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      lot: Number(t.volume ?? 0),
      openPrice: Number(t.open_price ?? 0),
      closePrice: t.close_price != null ? Number(t.close_price) : null,
      profit: Number(t.profit ?? 0),
      openedAt: parseDate(t.open_time) ?? new Date(),
      closedAt: parseDate(t.close_time),
    }));

    if (trades.length) await prisma.trade.createMany({ data: trades });
    console.log(`✓ ${login}: starting=${starting} balance=${balance} equity=${equity} trades=${trades.length}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
