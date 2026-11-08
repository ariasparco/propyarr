import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { prisma } from '@/lib/prisma';
import { TicketThread } from '@/components/admin/TicketThread';

export default async function AdminTicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);

  const rows = await prisma.ticket.findMany({
    include: {
      user: { select: { name: true, email: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
    // Waiting threads first, then most recently active.
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });

  const t = dict.tickets;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-xl font-semibold text-white">
        {dict.admin.nav.tickets}
      </h2>

      {rows.length === 0 ? (
        <p className="card p-12 text-center text-white/50">{t.empty}</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <TicketThread
              key={row.id}
              locale={loc}
              ticket={{
                id: row.id,
                subject: row.subject,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                userName: row.user.name,
                userEmail: row.user.email,
                messages: row.messages.map((m) => ({
                  id: m.id,
                  fromAdmin: m.fromAdmin,
                  body: m.body,
                  createdAt: m.createdAt.toISOString(),
                })),
              }}
              t={{
                reply: t.reply,
                replyPlaceholder: t.replyPlaceholder,
                send: t.send,
                sending: t.sending,
                close: dict.admin.tickets.close,
                reopen: dict.admin.tickets.reopen,
                you: dict.admin.tickets.trader,
                support: t.support,
                failed: t.failed,
                statuses: t.statuses,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
