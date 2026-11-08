/**
 * Shows exactly what the rule engine is being fed for every live account.
 *
 * When rules look like they are "not working", the cause is almost always the
 * input rather than the logic: no trade history reaching the site, a stale
 * snapshot, or a day boundary that does not line up with the broker's. This
 * prints those inputs so the question can be answered from data.
 *
 *   cd C:\propino
 *   node deploy\check-rules.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const money = (n) =>
  (n < 0 ? '-' : ' ') +
  '$' +
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ageOf(date) {
  if (!date) return 'never';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 90) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

/** Same day key the engine uses, so the numbers here match what it sees. */
function dayKey(d, offsetHours) {
  return new Date(d.getTime() + offsetHours * 3600000).toISOString().slice(0, 10);
}

(async () => {
  const settings = await prisma.setting.findUnique({ where: { key: 'monitor' } });
  const cfg = settings ? JSON.parse(settings.value) : {};
  const offset = Number(cfg.dayResetUtcOffset ?? 0);

  console.log('');
  console.log('day boundary offset from UTC :', offset, 'h');
  console.log('server time now              :', new Date().toISOString());
  console.log("engine's idea of 'today'     :", dayKey(new Date(), offset));

  const accounts = await prisma.tradingAccount.findMany({
    include: { challenge: true, trades: { orderBy: { closedAt: 'desc' } } },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    console.log('\nNo trading accounts exist yet.\n');
    await prisma.$disconnect();
    return;
  }

  for (const a of accounts) {
    const S = a.startingBalance;
    let positions = [];
    try {
      positions = JSON.parse(a.openPositions || '[]');
    } catch {
      positions = [];
    }

    const today = dayKey(new Date(), offset);
    const closedToday = a.trades.filter(
      (t) => t.closedAt && dayKey(t.closedAt, offset) === today,
    );
    const realisedToday = closedToday.reduce((s, t) => s + t.profit, 0);
    const dayStart = a.balance - realisedToday;

    console.log('\n' + '='.repeat(62));
    console.log(`account ${a.accountNumber}   ${a.status} / ${a.phase}`);
    console.log('='.repeat(62));
    console.log(`  plan             : ${a.challenge.name}  (target ${a.challenge.profitTarget}% / P2 ${a.challenge.profitTargetP2}%)`);
    console.log(`  limits           : daily ${a.challenge.dailyDrawdown}%  max ${a.challenge.maxDrawdown}%  floating ${a.challenge.floatingRisk}%`);
    console.log(`  starting balance : ${money(S)}`);
    console.log(`  balance / equity : ${money(a.balance)} / ${money(a.equity)}`);
    console.log(`  last push        : ${ageOf(a.snapshotAt)}   source=${a.snapshotSource || '-'}`);
    console.log(`  read-only pass   : ${a.investorPassword ? 'set' : 'MISSING - agent will skip this account'}`);

    console.log('');
    console.log(`  TRADES IN DATABASE : ${a.trades.length}`);
    if (a.trades.length === 0) {
      console.log('    ^ nothing has been imported. Every rule that depends on');
      console.log('      trade history is inert: consistency, trading days,');
      console.log('      hold time, cooldown, instrument, and the realised part');
      console.log('      of the daily drawdown.');
    } else {
      const days = new Set(a.trades.map((t) => dayKey(t.openedAt, offset)));
      console.log(`    distinct trading days (by open) : ${days.size}`);
      console.log(`    closed today                    : ${closedToday.length}  realised ${money(realisedToday)}`);
      console.log('    most recent 5:');
      for (const t of a.trades.slice(0, 5)) {
        const heldSec = t.closedAt
          ? Math.round((t.closedAt.getTime() - t.openedAt.getTime()) / 1000)
          : null;
        console.log(
          `      ${t.symbol.padEnd(8)} ${t.type.padEnd(4)} ${money(t.profit).padStart(12)}` +
            `  held ${heldSec === null ? 'open' : heldSec + 's'}` +
            `  closed ${t.closedAt ? t.closedAt.toISOString().slice(0, 16).replace('T', ' ') : '-'}`,
        );
      }
    }

    console.log('');
    console.log(`  OPEN POSITIONS : ${positions.length}`);
    for (const p of positions) {
      console.log(`      ${String(p.symbol).padEnd(8)} ${money(Number(p.profit || 0)).padStart(12)}`);
    }

    // The three equity-based limits, computed the way the engine computes them.
    // Same floors the engine uses: the worst equity actually reached.
    const dayFloor = Math.min(a.equity, a.dayLowEquity ?? a.equity);
    const everFloor = Math.min(a.equity, a.lowestEquity ?? a.equity);
    const totalLoss = Math.max(0, S - everFloor);
    const dailyLoss = Math.max(0, dayStart - dayFloor);
    const floatingLoss = Math.max(
      positions.length >= 2 ? Math.max(0, a.balance - a.equity) : 0,
      a.worstFloating ?? 0,
    );
    const line = (label, used, limitPct, note) => {
      const limit = S * (limitPct / 100);
      const pctUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;
      const state = limit <= 0 ? 'OFF' : used >= limit ? 'BREACH' : pctUsed >= 80 ? 'WARN' : 'OK';
      console.log(
        `      ${label.padEnd(16)} ${money(used).padStart(12)} / ${money(limit).padStart(11)}` +
          `  ${String(pctUsed).padStart(3)}%  ${state}${note ? '  ' + note : ''}`,
      );
    };

    console.log('');
    console.log('  WORST POINTS SEEN (sampled between pushes)');
    console.log(`      today's lowest equity : ${a.dayLowEquity == null ? 'not sampled yet' : money(a.dayLowEquity) + '  (day ' + (a.dayLowKey || '-') + ')'}`);
    console.log(`      all-time lowest equity: ${a.lowestEquity == null ? 'not sampled yet' : money(a.lowestEquity)}`);
    console.log(`      worst floating loss   : ${a.worstFloating == null ? 'none' : money(a.worstFloating)}`);

    console.log('');
    console.log('  EQUITY LIMITS  (judged on the worst point, not this instant)');
    line('daily drawdown', dailyLoss, a.challenge.dailyDrawdown, `(day started at ${money(dayStart)})`);
    line('max drawdown', totalLoss, a.challenge.maxDrawdown);
    line(
      'floating risk',
      floatingLoss,
      a.challenge.floatingRisk,
      positions.length >= 2 ? '(2+ open: enforced)' : `(${positions.length} open now)`,
    );

    if (a.breachRule) {
      console.log('');
      console.log(`  BREACHED: ${a.breachRule} at ${a.breachedAt?.toISOString()} (${a.breachSource})`);
    }
  }

  console.log('');
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
