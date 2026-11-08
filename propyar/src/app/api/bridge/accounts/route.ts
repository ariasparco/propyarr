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
      // Unknown logins are reported, never created.
      //
      // This endpoint used to auto-provision: it invented a challenge, guessed
      // the starting balance from a bucket of the current balance, attached the
      // account to whichever admin it found first, and wrote a made-up order id.
      // Every one of those guesses poisons the rules downstream — a guessed
      // starting balance makes every drawdown percentage wrong, and an
      // admin-owned account puts the admin's name on the trader's certificate.
      // Accounts are issued through the order flow, where the plan, the capital
      // and the owner are all known.
      console.warn(
        `bridge: no trading account matches ${snap.accountNumber} — ignored`,
      );
      results.push({ accountNumber: snap.accountNumber, status: 'unknown' });
      continue;
    }

    // A snapshot with nothing in it is a terminal that has not connected yet,
    // not an account at zero. Storing it would overwrite the real balance with
    // zeros and hand the rule engine a wiped account.
    if (snap.balance === 0 && snap.equity === 0) {
      console.warn(
        `bridge: ignoring empty snapshot for ${snap.accountNumber} (terminal not connected yet)`,
      );
      results.push({ accountNumber: snap.accountNumber, status: 'not_ready' });
      continue;
    }

    // Fold the agent's sampled worst points into the stored watermarks.
    //
    // Read and write inside one transaction. Two pushes landing together — the
    // scheduled agent and an admin pressing the button — would otherwise both
    // read the old marks and the slower write would erase the worse one, which
    // is precisely the number the rules are judged against.
    const accountId = account.id;
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.tradingAccount.findUnique({
        where: { id: accountId },
        select: {
          dayStartBalance: true,
          dayLowKey: true,
          dayLowEquity: true,
          lowestEquity: true,
          dayLowBalance: true,
          lowestBalance: true,
          worstFloating: true,
          worstFloatingPct: true,
        },
      });
      if (!fresh) return;

      // The terminal's own reading of the broker clock wins over the panel's
      // fallback. Two accounts on brokers in different timezones each get their
      // own midnight, which one platform-wide number could never do.
      const dayOffset = snap.serverUtcOffset ?? dayResetUtcOffset;

      const marks = nextWatermarks(fresh, {
        balance: snap.balance,
        equity: snap.equity,
        equityLow: snap.equityLow,
        balanceLow: snap.balanceLow,
        floatingWorst: snap.floatingWorst,
        floatingWorstPct: snap.floatingWorstPct,
        openCount: snap.positions?.length ?? 0,
        // The floating rule only bites from two positions up, so a burst that
        // opened and closed between pushes has to be reported for its sampled
        // figure to count at all.
        openCountPeak: snap.openCountPeak,
      }, dayOffset);

      await tx.tradingAccount.update({
        where: { id: accountId },
        data: {
          balance: snap.balance,
          equity: snap.equity,
          dayStartBalance: marks.dayStartBalance,
          dayLowEquity: marks.dayLowEquity,
          dayLowKey: marks.dayLowKey,
          lowestEquity: marks.lowestEquity,
          dayLowBalance: marks.dayLowBalance,
          lowestBalance: marks.lowestBalance,
          worstFloating: marks.worstFloating,
          worstFloatingPct: marks.worstFloatingPct,
          openPositions: JSON.stringify(snap.positions ?? []),
          ...(snap.serverUtcOffset !== undefined
            ? { brokerUtcOffset: snap.serverUtcOffset }
            : {}),
          snapshotAt: new Date(),
          snapshotSource: 'bridge',
        },
      });
    });

    // Deals are keyed by broker ticket and merged, not appended. Upsert rather
    // than create-and-ignore, because a deal's profit still moves after the
    // close: the broker books swap and commission afterwards, and skipping the
    // update would leave the platform judging the trader on the pre-fee figure.
    for (const d of snap.deals ?? []) {
      const externalId = `${snap.accountNumber}:${d.ticket}`;
      const row = {
        symbol: d.symbol,
        type: d.type,
        lot: d.lot,
        openPrice: d.openPrice ?? 0,
        closePrice: d.closePrice ?? 0,
        profit: d.profit,
        openedAt: new Date(d.openedAt),
        closedAt: new Date(d.closedAt),
      };
      await prisma.trade
        .upsert({
          where: { externalId },
          update: row,
          create: { accountId, externalId, ...row },
        })
        .catch((err) =>
          console.warn(`bridge: trade upsert failed for ${externalId}:`, err),
        );
    }

    // Evaluate immediately so a breach is caught on this push, not minutes later.
    const report = await runAccountCheck(accountId);
    results.push({
      accountNumber: snap.accountNumber,
      status: report?.breaches.length ? 'breached' : (report?.status ?? 'ok'),
    });
  }

  return ok({ received: results.length, results });
}
