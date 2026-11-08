import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ok, fail } from '@/lib/api';
import { bridgeAccountSchema, type BridgeAccount } from '@/lib/validation';
import { runAccountCheck } from '@/lib/monitor-run';
import { loadMonitorSettings } from '@/lib/data';
import { nextWatermarks } from '@/lib/watermarks';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Ingest point for terminal data. Any agent that can read an MT5 account —
// the bundled Python agent, an MQL5 expert advisor, or a broker-side script —
// pushes snapshots here. Nothing about this endpoint depends on a third-party
// service, so it works from any network.
//
// Auth: `Authorization: Bearer <BRIDGE_SECRET>`.
export async function POST(req: NextRequest) {
  const secret = process.env.BRIDGE_SECRET;
  if (!secret) return fail('bridge_not_configured', 503);

  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ') || header.slice(7) !== secret)
    return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  // Validate account by account rather than all-or-nothing. A single malformed
  // deal used to make the whole batch 422, so one odd trade could stop every
  // account on the terminal from being monitored.
  const envelope = z
    .object({ accounts: z.array(z.unknown()).min(1).max(200) })
    .safeParse(body);
  if (!envelope.success) return fail('validation', 422);

  // Read once per request, not once per account.
  const { dayResetUtcOffset } = await loadMonitorSettings();

  const results: Array<{ accountNumber: string; status: string }> = [];
  const snapshots: BridgeAccount[] = [];

  for (const raw of envelope.data.accounts) {
    const one = bridgeAccountSchema.safeParse(raw);
    if (one.success) {
      snapshots.push(one.data);
      continue;
    }
    const issue = one.error.issues[0];
    const number =
      raw && typeof raw === 'object' && 'accountNumber' in raw
        ? String((raw as { accountNumber: unknown }).accountNumber)
        : '?';
    console.warn(
      `bridge: rejected ${number} — ${issue?.path.join('.')}: ${issue?.message}`,
    );
    results.push({ accountNumber: number, status: 'invalid' });
  }

  for (const snap of snapshots) {
    const account = await prisma.tradingAccount.findUnique({
      where: { accountNumber: snap.accountNumber },
      select: {
        id: true,
        status: true,
        balance: true,
        startingBalance: true,
        dayStartBalance: true,
        dayLowEquity: true,
        dayLowKey: true,
        lowestEquity: true,
        worstFloating: true,
      },
    });
    if (!account) {
      results.push({ accountNumber: snap.accountNumber, status: 'unknown' });
      continue;
    }

    // Fold the agent's sampled worst points into the stored watermarks.
    const marks = nextWatermarks(
      {
        dayStartBalance: account.dayStartBalance,
        dayLowKey: account.dayLowKey,
        dayLowEquity: account.dayLowEquity,
        lowestEquity: account.lowestEquity,
        worstFloating: account.worstFloating,
      },
      {
        balance: snap.balance,
        equity: snap.equity,
        equityLow: snap.equityLow,
        floatingWorst: snap.floatingWorst,
        openCount: snap.positions?.length ?? 0,
      },
      dayResetUtcOffset,
    );

    // Store the snapshot. Closed deals are inserted by external id, so a repeat
    // push of the same history is a no-op.
    await prisma.tradingAccount.update({
      where: { id: account.id },
      data: {
        balance: snap.balance,
        equity: snap.equity,
        dayStartBalance: marks.dayStartBalance,
        dayLowEquity: marks.dayLowEquity,
        dayLowKey: marks.dayLowKey,
        lowestEquity: marks.lowestEquity,
        worstFloating: marks.worstFloating,
        openPositions: JSON.stringify(snap.positions ?? []),
        snapshotAt: new Date(),
        snapshotSource: 'bridge',
      },
    });

    for (const d of snap.deals ?? []) {
      await prisma.trade
        .create({
          data: {
            accountId: account.id,
            externalId: `${snap.accountNumber}:${d.ticket}`,
            symbol: d.symbol,
            type: d.type,
            lot: d.lot,
            openPrice: d.openPrice ?? 0,
            closePrice: d.closePrice ?? 0,
            profit: d.profit,
            openedAt: new Date(d.openedAt),
            closedAt: new Date(d.closedAt),
          },
        })
        .catch(() => undefined); // duplicate ticket — already imported
    }

    // Evaluate immediately so a breach is caught on this push, not minutes later.
    const report = await runAccountCheck(account.id);
    results.push({
      accountNumber: snap.accountNumber,
      status: report?.breaches.length ? 'breached' : (report?.status ?? 'ok'),
    });
  }

  return ok({ received: results.length, results });
}
