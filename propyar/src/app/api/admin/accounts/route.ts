import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { adminAccountActionSchema } from '@/lib/validation';
import { ok, fail, audit } from '@/lib/api';
import { getTradingPlatform } from '@/lib/trading';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = adminAccountActionSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const account = await prisma.tradingAccount.findUnique({
    where: { id: parsed.data.accountId },
  });
  if (!account) return fail('account_not_found', 404);

  let data: {
    status?: string;
    phase?: string;
    breachRule?: string | null;
    breachDetail?: string | null;
    breachedAt?: Date | null;
    breachSource?: string | null;
    breachNote?: string | null;
    userId?: string;
  } = {};

  /**
   * Clears a verdict when an account is put back into play.
   *
   * PASS and FUND used to leave the old breach fields sitting on the row, so a
   * reinstated account still showed the warning that failed it. Harmless while
   * that was a bare rule key; not harmless now that it carries a written
   * explanation the trader reads.
   */
  const cleared = {
    breachRule: null,
    breachDetail: null,
    breachedAt: null,
    breachSource: null,
    breachNote: null,
  };
  switch (parsed.data.action) {
    case 'ASSIGN': {
      // Hand an account to the trader it belongs to.
      //
      // Needed because accounts pushed by the terminal bridge used to be
      // auto-created against the first admin account found. Everything that
      // reads the owner then reads the admin: the dashboard shows the account to
      // nobody, and — the reason this was reported — the achievement certificate
      // is issued in the admin's name instead of the trader's.
      if (!parsed.data.userEmail) return fail('validation', 422);
      const owner = await prisma.user.findUnique({
        where: { email: parsed.data.userEmail.toLowerCase().trim() },
        select: { id: true },
      });
      if (!owner) return fail('user_not_found', 404);
      data = { userId: owner.id };
      // Certificates already issued carry the old owner. Move them with the
      // account rather than leaving them orphaned on the previous user.
      await prisma.certificate.updateMany({
        where: { accountId: account.id },
        data: { userId: owner.id },
      });
      break;
    }
    case 'CREDENTIALS': {
      // Correct what the monitoring terminal signs in with.
      //
      // These are typed by hand when the account is handed over, and until now
      // there was no way to fix a typo. A wrong password does not surface as an
      // error anywhere: MetaTrader fails the login quietly and the broker's demo
      // server issues a fresh account, so the terminal monitors a stranger's
      // account while the panel shows nothing amiss.
      const next: {
        accountNumber?: string;
        server?: string;
        password?: string;
        investorPassword?: string;
      } = {};

      if (parsed.data.accountNumber) {
        const number = parsed.data.accountNumber.trim();
        if (number !== account.accountNumber) {
          // The number is the key the bridge matches pushes against, so two
          // accounts sharing one would send each other's figures.
          const clash = await prisma.tradingAccount.findUnique({
            where: { accountNumber: number },
            select: { id: true },
          });
          if (clash) return fail('duplicate_number', 409);
          next.accountNumber = number;
        }
      }
      if (parsed.data.server) next.server = parsed.data.server.trim();
      if (parsed.data.password) next.password = parsed.data.password;
      if (parsed.data.investorPassword)
        next.investorPassword = parsed.data.investorPassword;

      if (Object.keys(next).length === 0) return ok({ unchanged: true });

      // Changing the login invalidates everything recorded against the old one.
      // The marks are what the drawdown rules are judged against, and carrying
      // one account's floor onto another is how a healthy account gets failed.
      const relogin =
        next.accountNumber !== undefined || next.investorPassword !== undefined;

      await prisma.tradingAccount.update({
        where: { id: account.id },
        data: {
          ...next,
          ...(relogin
            ? {
                dayLowEquity: null,
                dayLowKey: null,
                lowestEquity: null,
                worstFloating: null,
                dayStartBalance: null,
                snapshotAt: null,
                snapshotSource: null,
              }
            : {}),
        },
      });

      // Never log the passwords themselves — only that they changed.
      await audit('admin.account.credentials', session.sub, {
        accountId: account.id,
        accountNumber: next.accountNumber ?? account.accountNumber,
        changed: Object.keys(next),
        watermarksCleared: relogin,
      });

      return ok({
        account: { id: account.id, accountNumber: next.accountNumber ?? account.accountNumber },
        watermarksCleared: relogin,
      });
    }
    case 'DELETE': {
      // Remove an account and everything hanging off it.
      //
      // Trades, certificates and payouts cascade from the schema; the order is
      // detached by hand because it is the customer's purchase record and lives
      // on its own. Test accounts created during setup have no real order, so
      // this also clears those.
      const order = account.orderId
        ? await prisma.order.findUnique({
            where: { id: account.orderId },
            select: { id: true, kind: true, paymentStatus: true, amount: true },
          })
        : null;

      await prisma.tradingAccount.delete({ where: { id: account.id } });

      // Only orders that never represented a real payment are removed with it.
      // Deleting a paid order would erase the record of money the customer sent.
      let orderDeleted = false;
      if (order && order.amount === 0 && order.paymentStatus !== 'PAID') {
        await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
        orderDeleted = true;
      }

      await audit('admin.account.delete', session.sub, {
        accountId: account.id,
        accountNumber: account.accountNumber,
        orderDeleted,
      });

      return ok({ deleted: true, orderDeleted });
    }
    case 'DISABLE':
      await getTradingPlatform().disableAccount(account.accountNumber);
      // A reason is welcome but not demanded here: an account is also disabled
      // for expiry and housekeeping, where there is nothing to explain.
      data = {
        status: 'DISABLED',
        ...(parsed.data.note ? { breachNote: parsed.data.note } : {}),
      };
      break;
    case 'PASS':
      // Marks the stage passed. It does NOT move the account into the next one.
      //
      // It used to flip the phase in place, and that quietly broke the account
      // it was applied to. The next stage is a different login on a fresh
      // balance: a $1,000 account that reached $1,100 in phase 1 kept both
      // numbers, so against the 5% phase-2 target it opened already showing
      // 200% and could be funded without placing a trade. The drawdown floors
      // carried over from phase 1 too.
      //
      // Marking it PASSED puts it into the flow that was built for this: the
      // trader gets the "request the next account" button, the request lands in
      // the admin orders queue, and completing it issues a new login starting
      // at the plan's capital. FUND is still there for skipping straight to a
      // funded account.
      data = { ...cleared, status: 'PASSED' };
      break;
    case 'FUND':
      data = { ...cleared, status: 'FUNDED', phase: 'FUNDED' };
      break;
    case 'FAIL': {
      // Manual rule-breach override (fallback if the auto engine misses one).
      //
      // The written reason is mandatory. An automatic breach explains itself —
      // the engine stores which rule fired, what it measured and against what
      // limit. A manual one has none of that, so whatever the admin knows and
      // does not write down is lost, and the trader is left with a failed
      // account and no way to find out why.
      if (!parsed.data.note) return fail('note_required', 422);
      await getTradingPlatform().disableAccount(account.accountNumber);
      data = {
        status: 'FAILED',
        breachRule: 'ADMIN_MANUAL',
        breachedAt: new Date(),
        breachSource: 'ADMIN',
        breachNote: parsed.data.note,
        // No figures stand behind a hand-made verdict, and the panel renders
        // whatever is here as measured evidence. Anything left from an earlier
        // automatic check would be read as the reason for this one.
        breachDetail: null,
      };
      break;
    }
  }

  const updated = await prisma.tradingAccount.update({
    where: { id: account.id },
    data,
  });

  await audit('admin.account', session.sub, {
    accountId: account.id,
    action: parsed.data.action,
    // Who failed an account by hand, and on what grounds, is the part of this
    // record a dispute actually turns on.
    ...(parsed.data.note ? { note: parsed.data.note } : {}),
  });

  return ok({
    account: { id: updated.id, status: updated.status, phase: updated.phase },
  });
}
