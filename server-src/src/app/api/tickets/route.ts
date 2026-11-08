import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, rateLimit, audit } from '@/lib/api';
import { ticketCreateSchema, ticketReplySchema } from '@/lib/validation';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);

  const tickets = await prisma.ticket.findMany({
    where: { userId: session.sub },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  return ok({ tickets });
}

/** Opens a ticket with its first message. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`ticket:${session.sub}`, 10, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = ticketCreateSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const ticket = await prisma.ticket.create({
    data: {
      userId: session.sub,
      subject: parsed.data.subject,
      messages: { create: { body: parsed.data.body, fromAdmin: false } },
    },
  });
  await audit('ticket.open', session.sub, { ticketId: ticket.id });

  return ok({ ticketId: ticket.id });
}

/** Adds the trader's reply and reopens the thread for support. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('unauthorized', 401);
  if (!rateLimit(`ticketreply:${session.sub}`, 20, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = ticketReplySchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const ticket = await prisma.ticket.findFirst({
    where: { id: parsed.data.ticketId, userId: session.sub },
  });
  if (!ticket) return fail('not_found', 404);
  if (ticket.status === 'CLOSED') return fail('ticket_closed', 409);

  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, body: parsed.data.body, fromAdmin: false },
  });
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'OPEN', updatedAt: new Date() },
  });

  return ok({ sent: true });
}
