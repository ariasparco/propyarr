// Runs the FIXED karfarma rule engine (src/lib/monitor.ts) against the REAL
// exported histories of the three MetaQuotes-Demo test accounts that live in
// project_me. This proves the corrected logic integrates and behaves on the
// actual account data without needing a live MT5 terminal / MetaApi here.
//
//   npx tsx scripts/verify-accounts.ts
import { readFileSync } from 'node:fs';
import { buildReport, MONITOR_DEFAULTS, type MonitorChallenge, type MonitorTrade } from '../src/lib/monitor';

const SRC = 'C:/Users/SURFACE/Desktop/karlanser/karlancer/prop bot analyse/project_me/';

const CHALLENGE: MonitorChallenge = {
  profitTarget: 10,
  profitTargetP2: 5,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  floatingRisk: 2.5,
  minTradingDays: 5,
};

function parse(s: string): Date {
  // "2026.08.18 20:48:20" -> JS-parseable "2026-08-18 20:48:20"
  return new Date(s.replace(/\./g, '-'));
}

function load(login: string) {
  const j = JSON.parse(readFileSync(`${SRC}history_${login}.json`, 'utf-8'));
  const trades: MonitorTrade[] = (j.trades ?? []).map((t: any) => ({
    symbol: t.symbol,
    profit: Number(t.profit),
    openedAt: parse(t.open_time),
    closedAt: t.close_time ? parse(t.close_time) : null,
  }));
  return { summary: j.summary, trades };
}

for (const login of ['5054622771', '5054622905', '111275103']) {
  const { summary, trades } = load(login);
  const starting = Number(summary.deposit);
  const balance = Number(summary.balance);
  const equity = Number(summary.equity);

  const report = buildReport(
    {
      startingBalance: starting,
      balance,
      equity,
      phase: 'PHASE_1',
      status: 'ACTIVE',
    },
    CHALLENGE,
    trades,
    MONITOR_DEFAULTS,
    'verify',
  );

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Account ${login}  (deposit ${starting}, balance ${balance}, equity ${equity})`);
  console.log(`Trades: ${trades.length}   Profit: ${report.profit}`);
  for (const r of report.rules) {
    const limit = typeof r.limit === 'number' ? r.limit : '-';
    console.log(
      `  • ${r.key.padEnd(16)} state=${r.state.padEnd(6)} used=${String(r.used).padEnd(10)} limit=${limit}  ${r.detail ?? ''}`,
    );
  }
  console.log(`  → account status: ${report.status}`);
}
