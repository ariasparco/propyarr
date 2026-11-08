import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ok, fail, audit } from '@/lib/api';
import { ticketReplySchema, ticketStatusSchema } from '@/lib/validation';
import { email as mailer } from '@/lib/email';

/** Support replies, which marks the thread answered. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = ticketReplySchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.ticketId },
    include: { user: { select: { email: true } } },
  });
  if (!ticket) return fail('not_found', 404);

  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, body: parsed.data.body, fromAdmin: true },
  });
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'ANSWERED', updatedAt: new Date() },
  });

  await audit('admin.ticket.reply', session.sub, { ticketId: ticket.id });
  await mailer.ticketAnswered(ticket.user.email, ticket.subject);

  return ok({ sent: true });
}

/** Closes or reopens a thread. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }
  const parsed = ticketStatusSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  await prisma.ticket.update({
    where: { id: parsed.data.ticketId },
    data: { status: parsed.data.status },
  });
  await audit('admin.ticket.status', session.sub, {
    ticketId: parsed.data.ticketId,
    status: parsed.data.status,
  });

  return ok({ status: parsed.data.status });
}
