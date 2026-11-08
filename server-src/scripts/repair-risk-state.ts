// Repairs risk state left behind by the pre-fix engine.
//
//   npx tsx scripts/repair-risk-state.ts          # report only, changes nothing
//   npx tsx scripts/repair-risk-state.ts --apply  # write the fixes
//
// Three things need undoing, and none of them can be fixed by the engine alone
// because they are stored values rather than computed ones:
//
//   1. The rule settings row still holds the old 15-minute cooldown and is
//      missing the trading-day offset entirely, so the engine falls back to a
//      UTC day boundary that does not match the broker's server.
//   2. `worstFloating` was accumulated without the two-position condition, so it
//      holds single-position floats. That mark is not reconstructible from trade
//      history — the only honest repair is to clear it and let it rebuild.
//   3. Accounts were failed by a cooldown rule that counted trades made before
//      the account existed. Those verdicts were never valid.
//
// The account is re-evaluated with the corrected engine before anything is
// restored: a breach that still holds under the new rules stays a breach.
import { PrismaClient } from '@prisma/client';
import {
  buildReport,
  MONITOR_DEFAULTS,
  type MonitorSettings,
  type MonitorTrade,
} from '../src/lib/monitor';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

function log(...args: unknown[]) {
  console.log(...args);
}

async function main() {
  log(apply ? '── APPLYING FIXES ──\n' : '── DRY RUN (pass --apply to write) ──\n');

  // ── 1. Rule settings ──────────────────────────────────────
  const row = await prisma.setting.findUnique({ where: { key: 'rules' } });
  const stored = row ? (JSON.parse(row.value) as Partial<MonitorSettings>) : {};
  const settings: MonitorSettings = { ...MONITOR_DEFAULTS, ...stored };

  const fixedSettings: MonitorSettings = {
    ...settings,
    hftCooldownMinutes: 5,
    // Written explicitly rather than left to the default, so the value the
    // engine uses is visible in the admin panel and can be changed there.
    dayResetUtcOffset: settings.dayResetUtcOffset ?? 0,
  };

  if (settings.hftCooldownMinutes !== fixedSettings.hftCooldownMinutes) {
    log(
      `settings: hftCooldownMinutes ${settings.hftCooldownMinutes} → ${fixedSettings.hftCooldownMinutes}`,
    );
  }
  if (stored.dayResetUtcOffset === undefined) {
    log(
      `settings: dayResetUtcOffset was unset → ${fixedSettings.dayResetUtcOffset} (change it in the admin panel to match your broker)`,
    );
  }
  if (apply) {
    const value = JSON.stringify(fixedSettings);
    await prisma.setting.upsert({
      where: { key: 'rules' },
      update: { value },
      create: { key: 'rules', value },
    });
  }

  // ── 2 & 3. Per-account repair ─────────────────────────────
  const accounts = await prisma.tradingAccount.findMany({
    include: { challenge: true, trades: true, user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let cleared = 0;
  let restored = 0;

  for (const a of accounts) {
    const notes: string[] = [];

    // Polluted floating high-water mark.
    const pollutedFloat = (a.worstFloating ?? 0) > 0;
    if (pollutedFloat) {
      notes.push(`worstFloating ${a.worstFloating?.toFixed(2)} → cleared`);
      cleared += 1;
    }

    // Re-run the corrected engine. Note this uses the *repaired* floating mark,
    // so a stale value cannot keep an account failed.
    const openPositions = parseOpen(a.openPositions);
    const trades: MonitorTrade[] = [
      ...a.trades.map((t) => ({
        symbol: t.symbol,
        profit: t.profit,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      ...openPositions,
    ];

    const report = buildReport(
      {
        startingBalance: a.startingBalance,
        balance: a.balance,
        equity: a.equity,
        dayLowEquity: a.dayLowEquity,
        lowestEquity: a.lowestEquity,
        worstFloating: 0,
        dayStartBalance: a.dayStartBalance,
        openedAt: a.createdAt,
        openPositions: openPositions.length,
        phase: a.phase,
        // Judged as if still running, so a stale FAILED cannot mask the answer.
        status: 'ACTIVE',
      },
      a.challenge,
      trades,
      fixedSettings,
      'repair',
    );

    const stillBreached = report.breaches.length > 0;
    const wronglyFailed =
      a.status === 'FAILED' && a.breachSource === 'AUTO' && !stillBreached;

    if (wronglyFailed) {
      notes.push(
        `FAILED(${a.breachRule}) → ACTIVE — no rule breached under the corrected engine`,
      );
      restored += 1;
    } else if (a.status === 'FAILED' && stillBreached) {
      notes.push(`stays FAILED — still breaches ${report.breaches.join(', ')}`);
    }

    if (notes.length === 0) continue;

    log(`#${a.accountNumber} (${a.user.email})`);
    for (const n of notes) log(`   • ${n}`);

    if (apply) {
      await prisma.tradingAccount.update({
        where: { id: a.id },
        data: {
          ...(pollutedFloat ? { worstFloating: 0 } : {}),
          ...(wronglyFailed
            ? {
                status: 'ACTIVE',
                breachRule: null,
                breachDetail: null,
                breachedAt: null,
                breachSource: null,
              }
            : {}),
        },
      });
    }
  }

  log(
    `\n${cleared} floating mark(s) cleared, ${restored} account(s) restored.` +
      (apply ? '' : '\nNothing was written — re-run with --apply.'),
  );
}

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

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
