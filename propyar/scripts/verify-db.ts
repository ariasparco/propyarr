// Exercises the real DB -> buildReport path the panel uses, for the 3 test
// accounts. Run: npx tsx scripts/verify-db.ts
import { PrismaClient } from '@prisma/client';
import { buildReport, MONITOR_DEFAULTS, type MonitorSettings } from '../src/lib/monitor';

const prisma = new PrismaClient();
const DEFAULTS: MonitorSettings = { ...MONITOR_DEFAULTS };

async function main() {
  const setting = await prisma.setting.findUnique({ where: { key: 'rules' } });
  const settings: MonitorSettings = setting
    ? { ...MONITOR_DEFAULTS, ...JSON.parse(setting.value) }
    : MONITOR_DEFAULTS;

  const accounts = await prisma.tradingAccount.findMany({
    include: { challenge: true, trades: true },
    where: { accountNumber: { in: ['5054622771', '5054622905', '111275103'] } },
  });

  for (const a of accounts) {
    const report = buildReport(
      {
        startingBalance: a.startingBalance,
        balance: a.balance,
        equity: a.equity,
        phase: a.phase,
        status: a.status,
      },
      a.challenge,
      a.trades.map((t) => ({
        symbol: t.symbol,
        profit: t.profit,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      settings,
      'db',
    );
    console.log(`\n═══ ${a.accountNumber} (${a.challenge.name}) — status ${report.status}`);
    for (const r of report.rules) {
      console.log(
        `  • ${r.key.padEnd(16)} ${r.state.padEnd(6)} used=${String(r.used).padEnd(10)} limit=${r.limit}  ${r.detail ?? ''}`,
      );
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
