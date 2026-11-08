// Recomputes every rule for every account straight from stored data.
//   npx tsx scripts/replay-account.ts            # all accounts
//   npx tsx scripts/replay-account.ts 5054963695 # one account
//
// The engine is a pure function, so its verdict can always be rebuilt from the
// trade history and the stored watermarks. That makes this the answer to
// "why does the panel say that": run it, and the same numbers the trader sees
// come back with every rule's input laid out.
//
// It is also the regression check that matters most — if a stored status ever
// disagrees with the recomputed one, something wrote a verdict the rules do not
// support, and this prints the mismatch.
import { PrismaClient } from '@prisma/client';
import {
  buildReport,
  MONITOR_DEFAULTS,
  type MonitorSettings,
  type MonitorTrade,
} from '../src/lib/monitor';

const prisma = new PrismaClient();
const only = process.argv[2];

function parseOpen(raw: string | null): MonitorTrade[] {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as Array<{
      symbol?: string;
      profit?: number;
      openedAt?: string;
    }>;
    return Array.isArray(rows)
      ? rows.map((p) => ({
          symbol: String(p.symbol ?? ''),
          profit: Number(p.profit ?? 0),
          openedAt: p.openedAt ? new Date(p.openedAt) : new Date(),
          closedAt: null,
        }))
      : [];
  } catch {
    return [];
  }
}

async function main() {
  const row = await prisma.setting.findUnique({ where: { key: 'rules' } });
  const settings: MonitorSettings = {
    ...MONITOR_DEFAULTS,
    ...(row ? (JSON.parse(row.value) as Partial<MonitorSettings>) : {}),
  };
  console.log('settings:', settings, '\n');

  const accounts = await prisma.tradingAccount.findMany({
    where: only ? { accountNumber: only } : {},
    include: { challenge: true, trades: true, user: { select: { email: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let mismatches = 0;

  for (const a of accounts) {
    const open = parseOpen(a.openPositions);
    const trades: MonitorTrade[] = [
      ...a.trades.map((t) => ({
        symbol: t.symbol,
        profit: t.profit,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      ...open,
    ];

    const report = buildReport(
      {
        startingBalance: a.startingBalance,
        balance: a.balance,
        equity: a.equity,
        dayLowEquity: a.dayLowEquity,
        lowestEquity: a.lowestEquity,
        worstFloating: a.worstFloating,
        dayStartBalance: a.dayStartBalance,
        openedAt: a.createdAt,
        openPositions: open.length,
        phase: a.phase,
        status: a.status,
      },
      a.challenge,
      trades,
      settings,
      'replay',
    );

    const age = a.snapshotAt
      ? `${Math.round((Date.now() - a.snapshotAt.getTime()) / 60_000)}m old`
      : 'never synced';

    console.log(
      `#${a.accountNumber}  ${a.user.email}${a.user.role === 'ADMIN' ? '  [UNASSIGNED — admin-owned]' : ''}`,
    );
    console.log(
      `  start=${a.startingBalance}  balance=${a.balance}  equity=${a.equity}  ` +
        `closed=${a.trades.length} open=${open.length}  data ${age}`,
    );
    console.log(`  stored=${a.status}  recomputed=${report.status}`);
    if (a.status !== report.status) {
      mismatches += 1;
      console.log('  ⚠ STORED STATUS DISAGREES WITH THE RULES');
    }
    for (const r of report.rules) {
      const pctText = r.limit > 0 ? `${r.usedPct.toFixed(1)}%` : '—';
      console.log(
        `   ${r.key.padEnd(16)} ${r.state.padEnd(6)} ` +
          `used=${r.used.toFixed(2).padStart(9)} limit=${r.limit.toFixed(2).padStart(9)} ` +
          `${pctText.padStart(7)}  ${r.detail ?? ''}`,
      );
    }
    console.log('');
  }

  console.log(
    mismatches === 0
      ? `✅ ${accounts.length} account(s) replayed — every stored status matches the rules.`
      : `⚠ ${mismatches} account(s) have a stored status the rules do not support.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
