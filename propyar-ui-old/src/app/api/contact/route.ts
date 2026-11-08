import { NextRequest } from 'next/server';
import { contactSchema } from '@/lib/validation';
import { ok, fail, audit, rateLimit, clientIp } from '@/lib/api';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`contact:${ip}`, 5, 60_000))
    return fail('too_many_requests', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', 400);
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return fail('validation', 422);

  // In production: send to a helpdesk / email provider. Here we persist it as an
  // audit record so nothing is lost.
  await audit(
    'contact.message',
    null,
    {
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
    },
    ip,
  );

  return ok({ success: true });
}
