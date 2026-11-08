import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TicketPanel } from '@/components/dashboard/TicketPanel';

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const rows = await prisma.ticket.findMany({
    where: { userId: session.sub },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });

  const tickets = rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    messages: t.messages.map((m) => ({
      id: m.id,
      fromAdmin: m.fromAdmin,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {dict.dashboard.nav.tickets}
        </h2>
        <p className="mt-1 text-sm text-white/50">{dict.tickets.subtitle}</p>
      </div>
      <TicketPanel locale={loc} tickets={tickets} t={dict.tickets} />
    </div>
  );
}
